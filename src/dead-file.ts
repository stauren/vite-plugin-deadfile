import { promises as fs } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createFilter } from 'vite';
import { parse, type Module } from '@swc/core';
import { ensureDir } from 'fs-extra';
import { ImportVisitor } from './visitor';
import { isSafeFileName, isSafePath, cleanUrl, isParentDir } from './utils';
import { log } from './log';
import type { FilterPattern, Plugin } from 'vite';

export interface DeadFilePluginConfig {
  root?: string;
  exclude?: FilterPattern;
  include?: FilterPattern;
  output?: string;
  outputDir?: string;
  includeHiddenFiles?: boolean;
}

const REG_NODE_MODULES = /node_modules\//;
const REG_HIDDEN_FILES = /\/\.[^/]+$/;
const REG_VALID_EXTENSION = /\.\w+$/;

const astSupportedFileExtensions = ['js', 'jsx', 'ts', 'tsx'];

// refer to https://github.com/micromatch/picomatch for more match pattern
function createFileFilter(root: string, include: FilterPattern, rawExclude: FilterPattern, includeHidden: boolean) {
  const exclude =
    rawExclude instanceof Array ? [...rawExclude] : ([rawExclude].filter((o) => o !== null) as (string | RegExp)[]);

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

function isLegalSource(fileName: string) {
  if (fileName === '.' || fileName === '..') {
    return false;
  }
  if (fileName === 'node_modules') {
    return false;
  }
  return true;
}

async function readSourceFiles(root: string, filter: ReturnType<typeof createFilter>) {
  let result: string[] = [];
  const level1Sources = await fs.readdir(root);
  const readAll = level1Sources.filter(isLegalSource).map(async (fileName) => {
    const subFilePath = resolve(root, fileName);
    const fileStat = await fs.stat(subFilePath);
    if (fileStat.isDirectory()) {
      const subResult = await readSourceFiles(subFilePath, filter);
      result = [...result, ...subResult];
    } else if (fileStat.isFile()) {
      if (filter(subFilePath)) {
        result.push(subFilePath);
      }
    }
  });
  await Promise.all(readAll);
  return result;
}

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

async function ensureOutputFilePath(absRoot: string, outputDir: string, output: string): Promise<false | string> {
  const dir = getOutputPath(absRoot, outputDir);
  if (!dir) return dir;
  if (!isSafeFileName(output)) {
    log(`Unsafe output file name: ${output}`);
    return false;
  }
  await ensureDir(dir);
  return resolve(dir, output);
}

export default function vitePluginDeadFile({
  root = '.',
  include = [],
  exclude = [],
  includeHiddenFiles = false,
  outputDir = '.',
  output,
}: DeadFilePluginConfig = {}): Plugin {
  let doAnalysis = false;
  let touchedFiles: Set<string>;
  let sourceFiles: Set<string>;
  let deadFiles: Set<string>;
  let visitor: ImportVisitor;

  const absoluteRoot = resolve(root);
  const fileFilter = createFileFilter(absoluteRoot, include, exclude, includeHiddenFiles);

  const touchFile = (id: string) => {
    if (doAnalysis) {
      if (id.indexOf('node_modules') === -1) {
        if (sourceFiles.has(id)) {
          touchedFiles.add(id);
          deadFiles.delete(id);
        }
      }
    }
  };

  return {
    name: 'dead-file',
    enforce: 'pre',

    async configResolved(resolvedConfig) {
      if (resolvedConfig.command === 'build') {
        doAnalysis = true;
        touchedFiles = new Set();
        sourceFiles = new Set(await readSourceFiles(absoluteRoot, fileFilter));
        deadFiles = new Set(sourceFiles);
        visitor = new ImportVisitor();
      }
    },

    load(id: string) {
      if (!doAnalysis) return;
      touchFile(id);
    },

    async transform(source, importer) {
      if (!doAnalysis) return;
      if (!importer.startsWith('/') || importer.includes('node_modules')) {
        return;
      }

      const ext = extname(REG_VALID_EXTENSION.test(importer) ? importer : cleanUrl(importer)).slice(1);

      if (!astSupportedFileExtensions.includes(ext)) {
        return;
      }

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
        visitor.visitProgram(mod);
        const rawImports = visitor.getImports();
        const resolvedImports = await Promise.all(
          rawImports.map((rawImport) => {
            const resolved = this.resolve(rawImport, importer);
            return resolved;
          })
        );
        const resolvedIds = resolvedImports.map((r) => r?.id);
        resolvedIds.forEach((id) => {
          if (id) {
            touchFile(id);
          }
        });
      }
    },

    async renderStart() {
      if (!doAnalysis) return;

      const result = [
        `All source files: ${sourceFiles.size}`,
        `Used source files: ${touchedFiles.size}`,
        `Unused source files: ${deadFiles.size}`,
        ...[...deadFiles].map((fullPath) => `  .${fullPath.substring(absoluteRoot.length)}`),
      ];

      if (output) {
        const outputFile = await ensureOutputFilePath(absoluteRoot, outputDir, output);
        if (outputFile) {
          await fs.writeFile(outputFile, result.join('\n'));
          log(`Unused source files write to: ${outputFile}`);
        }
      } else {
        result.map((line) => console.log(line));
      }
    },
  };
}
