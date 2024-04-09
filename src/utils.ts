import { sep } from 'node:path';

const REG_POSTFIX = /[?#].*$/s;
const REG_SAFE_FILE_NAME = /^[a-zA-Z0-9._-]+$/;
const REG_SAFE_POSIX_PATH = /^(\.\/|\/)?([a-zA-Z0-9._-]+\/)+$/;
// only support relative path for win
const REG_SAFE_WIN_PATH = /^(\.\\)?([a-zA-Z0-9._-]+\\)+$/;

export function cleanUrl(url: string): string {
  return url.replace(REG_POSTFIX, '');
}

export function isSafeFileName(name: string) {
  return name.match(REG_SAFE_FILE_NAME);
}

export function withTrailingSlash(path: string): string {
  if (path[path.length - 1] !== sep) {
    return `${path}${sep}`;
  }
  return path;
}

export function isSafePath(name: string) {
  return withTrailingSlash(name).match(
    sep === '/' ? REG_SAFE_POSIX_PATH : REG_SAFE_WIN_PATH,
  );
}

export function isParentDir(parent: string, file: string) {
  return withTrailingSlash(file).startsWith(withTrailingSlash(parent));
}
