import { extname, isAbsolute, relative, resolve } from 'node:path';
import { type Module, parse } from '@swc/core';
import { ensureDir } from 'fs-extra';
import { createFilter } from 'vite';
import type { FilterPattern, Plugin } from 'vite';
import FileMarker from './file-marker';
import { log, outputLog } from './log';
import { cleanUrl, isParentDir, isSafeFileName, isSafePath } from './utils';
import { DynamicImportVisitor, ImportVisitor } from './visitor';

type FileUsedCallback = (file: string) => boolean;

export interface DeadFilePluginConfig {
  root?: string;
  exclude?: FilterPattern;
  include?: FilterPattern;
  output?: string;
  outputDir?: string;
  includeHiddenFiles?: boolean;
  throwWhenFound?: boolean | number;
  isDynamicModuleLive?: FileUsedCallback;
}

const REG_VALID_EXTENSION = /\.\w+$/;
const REG_NODE_MODULES = /node_modules\//;
const REG_HIDDEN_FILES = /\/\.[^/]+$/;
const REG_MISSING_SPECIFIER = /Missing .* specifier in .* package/;

const astSupportedFileExtensions = ['js', 'jsx', 'ts', 'tsx'];
const tsSupportedFileExtensions = ['ts', 'tsx'];

function getOutputPath(absRoot: string, outputDir: string): string {
  if (!isSafePath(outputDir)) {
    throw `Unsafe outputDir: ${outputDir}`;
  }
  const absOutputDir = isAbsolute(outputDir)
    ? outputDir
    : resolve(absRoot, outputDir);

  if (!isParentDir(absRoot, absOutputDir)) {
    throw `outputDir must be inside: ${absRoot}, but got: ${absOutputDir}`;
  }

  return absOutputDir;
}

async function ensureOutputFilePath(
  absRoot: string,
  outputDir: string,
  output: string,
): Promise<string> {
  const dir = getOutputPath(absRoot, outputDir);
  if (!isSafeFileName(output)) {
    throw `Unsafe output file name: ${output}`;
  }
  await ensureDir(dir);
  return resolve(dir, output);
}

// refer to https://github.com/micromatch/picomatch for more match pattern
function createFileFilter(
  root: string,
  include: FilterPattern,
  rawExclude: FilterPattern,
  includeHidden: boolean,
) {
  const exclude = Array.isArray(rawExclude)
    ? [...rawExclude]
    : ([rawExclude].filter((o) => o !== null) as (string | RegExp)[]);

  // exclude all files in node_modules directory
  exclude.push(REG_NODE_MODULES);

  // exclude all hidden files start with '.'
  if (!includeHidden) {
    exclude.push(REG_HIDDEN_FILES);
  }

  return createFilter(include, exclude, {
    resolve: root,
  });
}

function isLegalTransformTarget(
  importer: string,
  onlyScanTypeRef = false,
): boolean {
  if (!importer.startsWith('/') || importer.includes('node_modules')) {
    return false;
  }

  const ext = extname(
    REG_VALID_EXTENSION.test(importer) ? importer : cleanUrl(importer),
  ).slice(1);

  const legalExts = onlyScanTypeRef
    ? tsSupportedFileExtensions
    : astSupportedFileExtensions;
  if (!legalExts.includes(ext)) {
    return false;
  }
  return true;
}

function markDynamicImportFiles(
  fileMarker: FileMarker,
  root: string,
  isDynamicModuleLive?: FileUsedCallback,
) {
  const dynImport = fileMarker.viteDynamicImports;
  if (dynImport.size > 0) {
    if (isDynamicModuleLive) {
      for (const file of dynImport) {
        const rel = relative(root, file);
        if (!isDynamicModuleLive(rel)) {
          fileMarker.kill(file);
        }
      }
    }
  }
}

function shouldThrow(throwWhenFound: boolean | number, fileMarker: FileMarker) {
  if (throwWhenFound !== false) {
    if (
      (throwWhenFound === true && fileMarker.deadFiles.size > 0) ||
      (typeof throwWhenFound === 'number' &&
        fileMarker.deadFiles.size >= throwWhenFound)
    ) {
      return true;
    }
  }
  return false;
}

function getPrePlugin(
  fileMarker: FileMarker,
  {
    root = '.',
    include = [],
    exclude = [],
    includeHiddenFiles = false,
  }: DeadFilePluginConfig,
): Plugin {
  const absoluteRoot = resolve(root);

  let visitor: ImportVisitor;
  return {
    name: 'vite-plugin-deadfile-pre',
    enforce: 'pre',
    apply: 'build',

    async configResolved() {
      const fileFilter = createFileFilter(
        root,
        include,
        exclude,
        includeHiddenFiles,
      );
      await fileMarker.init(absoluteRoot, fileFilter);
      visitor = new ImportVisitor();
    },

    load(id: string) {
      fileMarker.revive(id);
    },

    /**
     * this hook use swc to scan and mark imports of typescript files
     * this must be done in pre phase because 'type only reference' imports
     * will be removed after ts is transformed into js
     */
    async transform(source, importer) {
      if (!isLegalTransformTarget(importer, true)) return;

      let mod: Module | undefined = undefined;
      try {
        mod = await parse(source, {
          syntax: 'typescript',
          tsx: true,
          target: 'es2022',
        });
      } catch (e: unknown) {
        log('parse error: ', importer, e);
      }

      if (mod) {
        visitor.init();
        visitor.visitProgram(mod);
        const rawImports = visitor.getImports();
        const resolvedImports = await Promise.all(
          rawImports.map((rawImport) => {
            const resolved = this.resolve(rawImport, importer);
            resolved.catch((reason) => {
              if (REG_MISSING_SPECIFIER.test(reason.message)) {
                fileMarker.markError(
                  importer,
                  `Error when "${importer}" import "${rawImport}": ${reason.message}`,
                );
              } else {
                this.error(reason);
              }
            });
            return resolved;
          }),
        );
        const resolvedIds = resolvedImports.map((r) => r?.id);
        for (const id of resolvedIds) {
          if (id) {
            fileMarker.revive(id);
          }
        }
      }
    },
  };
}
function getPostPlugin(
  fileMarker: FileMarker,
  {
    root = '.',
    outputDir = '.',
    throwWhenFound = false,
    isDynamicModuleLive,
    output,
  }: DeadFilePluginConfig,
): Plugin {
  let visitor: DynamicImportVisitor;
  const absoluteRoot = resolve(root);

  return {
    name: 'vite-plugin-deadfile-post',
    enforce: 'post',
    apply: 'build',

    configResolved() {
      visitor = new DynamicImportVisitor();
    },

    load(id: string) {
      fileMarker.revive(id);
    },

    /**
     * this is used to scan and mark dynamic batch imports
     * generated by vite such as 'import(`./modules/${name}.ts`)'
     * this has to be done in the post phase
     */
    async transform(source, importer) {
      if (!isLegalTransformTarget(importer)) return;

      let mod: Module | undefined = undefined;
      try {
        mod = await parse(source, {
          syntax: 'ecmascript',
          dynamicImport: true,
          target: 'es2022',
        });
      } catch (e: unknown) {
        log('parse error: ', importer, e);
      }

      if (mod) {
        visitor.init();
        visitor.visitProgram(mod);
        const rawImports = visitor.getViteDynamicImports();
        if (rawImports.length > 0) {
          const resolvedImports = await Promise.all(
            rawImports.map((rawImport) => {
              const resolved = this.resolve(rawImport, importer);
              return resolved;
            }),
          );
          for (const resolvedId of resolvedImports) {
            if (resolvedId) {
              fileMarker.viteDynamicImports.add(resolvedId.id);
            }
          }
        }
      }
    },
    async buildEnd(errors) {
      if (errors !== undefined) return;
      const dynImport = fileMarker.viteDynamicImports;
      markDynamicImportFiles(fileMarker, absoluteRoot, isDynamicModuleLive);

      if (fileMarker.errorFiles.size > 0) {
        const messages: string[] = [];
        for (const err of fileMarker.errorFiles) {
          messages.push(err[1]);
        }
        this.error(`[vite-plugin-deadfile]: ${messages.join('\n')}`);
      }

      let result = [
        `All source files: ${fileMarker.sourceFiles.size}`,
        `Used source files: ${fileMarker.touchedFiles.size}`,
        `Unused source files: ${fileMarker.deadFiles.size}`,
        ...[...fileMarker.deadFiles].map(
          (fullPath) => `  ./${relative(absoluteRoot, fullPath)}`,
        ),
      ];
      if (dynImport.size > 0 && !isDynamicModuleLive) {
        result = [
          ...result,
          `You may need to config 'isDynamicModuleLive' to check if the following ${
            dynImport.size
          } dynamically glob-import file${
            dynImport.size > 1 ? 's are' : ' is'
          } needed, more info https://github.com/stauren/vite-plugin-deadfile?tab=readme-ov-file#isdynamicmodulelive`,
          ...[...dynImport].map(
            (fullPath) => `  .${fullPath.substring(absoluteRoot.length)}`,
          ),
        ];
      }

      if (output) {
        const outputFile = await ensureOutputFilePath(
          absoluteRoot,
          outputDir,
          output,
        ).catch((err: string | Error) => {
          this.error(err);
        });
        if (outputFile) {
          outputLog(result, outputFile);
        }
      } else {
        outputLog(result);
      }

      if (shouldThrow(throwWhenFound, fileMarker)) {
        this.error(
          `[vite-plugin-deadfile]: Found ${
            fileMarker.deadFiles.size
          } unused source file${fileMarker.deadFiles.size > 1 ? 's' : ''}.\n${[
            ...fileMarker.deadFiles,
          ]
            .map((fullPath) => `  ./${relative(absoluteRoot, fullPath)}`)
            .join('\n')}`,
        );
      }
    },
  };
}

export default function vitePluginDeadFile({
  root = '.',
  include = [],
  exclude = [],
  includeHiddenFiles = false,
  outputDir = '.',
  throwWhenFound = false,
  isDynamicModuleLive,
  output,
}: DeadFilePluginConfig): Plugin[] {
  const fileMarker = new FileMarker();
  return [
    getPrePlugin(fileMarker, {
      root,
      include,
      exclude,
      includeHiddenFiles,
    }),
    getPostPlugin(fileMarker, {
      root,
      outputDir,
      throwWhenFound,
      output,
      isDynamicModuleLive,
    }),
  ];
}
