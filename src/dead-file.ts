import { promises as fs } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { type Module, parse } from '@swc/core';
import { ensureDir } from 'fs-extra';
import { createFilter } from 'vite';
import type { FilterPattern, Plugin } from 'vite';
import FileMarker from './file-marker';
import { log } from './log';
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

const astSupportedFileExtensions = ['js', 'jsx', 'ts', 'tsx'];

function getOutputPath(absRoot: string, outputDir: string): false | string {
  if (!isSafePath(outputDir)) {
    log(`Unsafe outputDir: ${outputDir}`);
    return false;
  }
  const absOutputDir = outputDir.startsWith('/')
    ? outputDir
    : resolve(absRoot, outputDir);

  if (!isParentDir(absRoot, absOutputDir)) {
    log(`outputDir must be inside: ${absRoot}, but got: ${absOutputDir}`);
    return false;
  }

  return absOutputDir;
}

async function ensureOutputFilePath(
  absRoot: string,
  outputDir: string,
  output: string,
): Promise<false | string> {
  const dir = getOutputPath(absRoot, outputDir);
  if (!dir) return dir;
  if (!isSafeFileName(output)) {
    log(`Unsafe output file name: ${output}`);
    return false;
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

function isLegalTransformTarget(importer: string): boolean {
  if (!importer.startsWith('/') || importer.includes('node_modules')) {
    return false;
  }

  const ext = extname(
    REG_VALID_EXTENSION.test(importer) ? importer : cleanUrl(importer),
  ).slice(1);

  if (!astSupportedFileExtensions.includes(ext)) {
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
    name: 'dead-file-pre',
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

    async transform(source, importer) {
      if (!isLegalTransformTarget(importer)) return;

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
    name: 'dead-file-post',
    enforce: 'post',
    apply: 'build',

    configResolved() {
      visitor = new DynamicImportVisitor();
    },

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
    async buildEnd() {
      const dynImport = fileMarker.viteDynamicImports;
      markDynamicImportFiles(fileMarker, absoluteRoot, isDynamicModuleLive);

      let result = [
        '[vite-plugin-deadfile]:',
        `  All source files: ${fileMarker.sourceFiles.size}`,
        `  Used source files: ${fileMarker.touchedFiles.size}`,
        `  Unused source files: ${fileMarker.deadFiles.size}`,
        ...[...fileMarker.deadFiles].map(
          (fullPath) => `    ./${relative(absoluteRoot, fullPath)}`,
        ),
      ];
      if (dynImport.size > 0 && !isDynamicModuleLive) {
        result = [
          ...result,
          `  You may need to config 'isDynamicModuleLive' to check if the following ${
            dynImport.size
          } dynamically glob-import file${
            dynImport.size > 1 ? 's are' : ' is'
          } needed, more info https://github.com/stauren/vite-plugin-deadfile?tab=readme-ov-file#isdynamicmodulelive`,
          ...[...dynImport].map(
            (fullPath) => `    .${fullPath.substring(absoluteRoot.length)}`,
          ),
        ];
      }

      if (output) {
        const outputFile = await ensureOutputFilePath(
          absoluteRoot,
          outputDir,
          output,
        );
        if (outputFile) {
          await fs.writeFile(outputFile, result.join('\n'));
          log(`Unused source files write to: ${outputFile}`);
        }
      } else {
        // biome-ignore lint/suspicious/noConsoleLog: plugin output
        result.map((line) => console.log(line));
      }

      if (shouldThrow(throwWhenFound, fileMarker)) {
        this.error(
          `[vite-plugin-deadfile]: Found ${
            fileMarker.deadFiles.size
          } unused source file${fileMarker.deadFiles.size > 1 ? 's' : ''}.`,
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
