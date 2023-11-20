import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

export interface DeadFilePluginConfig {
  projectRoot?: string;
  exclude?: string[];
  include?: string[];
  output?: string;
}

function transformToFullPath(root: string, subFiles: string[]) {
  return subFiles.map((fname) => {
    if (fname.startsWith('/')) {
      return fname;
    }
    return resolve(root, fname);
  });
}

function isLegalSource(fileName: string) {
  if (fileName.startsWith('.')) {
    return false;
  }
  if (fileName === 'node_modules') {
    return false;
  }
  return true;
}

function isSafeFileName(name: string) {
  return name.match(/^[a-zA-Z0-9._-]+$/);
}

async function readSourceFiles(root: string, includeFiles: string[] = [], excludeFiles: string[] = []) {
  let result: string[] = [];
  const level1Sources = await fs.readdir(root);
  const readAll = level1Sources.filter(isLegalSource).map(async (fileName) => {
    const subFileName = resolve(root, fileName);
    if (includeFiles.length > 0 && !includeFiles.includes(subFileName)) {
      return;
    }
    if (excludeFiles.includes(subFileName)) {
      return;
    }
    const fileStat = await fs.stat(subFileName);
    if (fileStat.isDirectory()) {
      const subResult = await readSourceFiles(subFileName);
      result = [...result, ...subResult];
    } else if (fileStat.isFile()) {
      result.push(subFileName);
    }
  });
  await Promise.all(readAll);
  return result;
}

export default function vitePluginDeadFile(
  { projectRoot = '.', include = [], exclude = [], output }: DeadFilePluginConfig = {}
): Plugin {
  let doAnalysis = false;
  let touchedFiles: Set<string>;
  let sourceFiles: Set<string>;
  let deadFiles: Set<string>;
  return {
    name: 'dead-file',
    enforce: 'pre',

    async configResolved(resolvedConfig) {
      if (resolvedConfig.command === 'build') {
        doAnalysis = true;
        touchedFiles = new Set();
        sourceFiles = new Set(
          await readSourceFiles(
            projectRoot,
            transformToFullPath(projectRoot, include),
            transformToFullPath(projectRoot, exclude)
          )
        );
        deadFiles = new Set(sourceFiles);
      }
    },


    load(id: string) {
      if (doAnalysis) {
        if (id.indexOf('node_modules') === -1) {
          if (sourceFiles.has(id)) {
            touchedFiles.add(id);
            deadFiles.delete(id);
          }
        }
      }
    },

    renderStart() {
      const result = [
        `All source files: ${sourceFiles.size}`,
        `Used source files: ${touchedFiles.size}`,
        `Unused source files: ${deadFiles.size}`,
        ...[...deadFiles].map((fullPath) => `  .${fullPath.substring(projectRoot.length)}`),
      ];
      if (typeof output === 'string' && isSafeFileName(output)) {
        const outputFile = resolve(projectRoot, output);
        console.log(`Unused source files write to: ${outputFile}`);
        fs.writeFile(outputFile, result.join('\n'));
      } else {
        result.map((line) => console.log(line));
      }
    },
  };
}
