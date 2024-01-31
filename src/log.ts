export function log(...contents: unknown[]) {
  // biome-ignore lint/suspicious/noConsoleLog: is's a logger
  console.log('[vite-plugin-deadfile] ', ...contents);
}
