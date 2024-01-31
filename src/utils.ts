const REG_POSTFIX = /[?#].*$/s;
const REG_SAFE_FILE_NAME = /^[a-zA-Z0-9._-]+$/;
const REG_SAFE_PATH = /^(\.\/|\/)?([a-zA-Z0-9._-]+\/)+$/;

export function cleanUrl(url: string): string {
  return url.replace(REG_POSTFIX, '');
}

export function isSafeFileName(name: string) {
  return name.match(REG_SAFE_FILE_NAME);
}

export function withTrailingSlash(path: string): string {
  if (path[path.length - 1] !== '/') {
    return `${path}/`;
  }
  return path;
}

export function isSafePath(name: string) {
  return withTrailingSlash(name).match(REG_SAFE_PATH);
}

export function isParentDir(parent: string, file: string) {
  return file.startsWith(withTrailingSlash(parent));
}
