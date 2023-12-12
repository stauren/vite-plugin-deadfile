const postfixRE = /[?#].*$/s;

export function cleanUrl(url: string): string {
  return url.replace(postfixRE, '');
}

export function isSafeFileName(name: string) {
  return name.match(/^[a-zA-Z0-9._-]+$/);
}
