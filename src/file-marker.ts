import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { createFilter } from 'vite';

function isLegalSource(fileName: string) {
  if (fileName === '.' || fileName === '..') {
    return false;
  }
  if (fileName === 'node_modules') {
    return false;
  }
  return true;
}

async function readSourceFiles(
  root: string,
  filter: ReturnType<typeof createFilter>,
) {
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

export default class FileMarker {
  public touchedFiles: Set<string> = new Set();
  public sourceFiles: Set<string> = new Set();
  public deadFiles: Set<string> = new Set();
  public viteDynamicImports: Set<string> = new Set();
  public errorFiles: Map<string, string> = new Map();

  public async init(root: string, filter: ReturnType<typeof createFilter>) {
    this.touchedFiles = new Set();
    this.viteDynamicImports = new Set();
    this.sourceFiles = new Set(await readSourceFiles(root, filter));
    this.deadFiles = new Set(this.sourceFiles);
  }

  public revive(id: string) {
    if (id.indexOf('node_modules') === -1) {
      if (this.sourceFiles.has(id)) {
        this.touchedFiles.add(id);
        this.deadFiles.delete(id);
      }
    }
  }

  public kill(id: string) {
    if (id.indexOf('node_modules') === -1) {
      if (this.sourceFiles.has(id)) {
        this.deadFiles.add(id);
        this.touchedFiles.delete(id);
      }
    }
  }

  public markError(importer: string, err: string) {
    this.errorFiles.set(importer, err);
  }
}
