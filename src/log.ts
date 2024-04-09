import { promises as fs } from 'node:fs';
import { relative } from 'node:path';

const PLUGIN_NAME = 'vite-plugin-deadfile';

const innerLogger = (...contents: unknown[]) => {
  // biome-ignore lint/suspicious/noConsoleLog: is's a logger
  console.log(...contents);
};

async function delay(timeout: number) {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

export function log(...contents: unknown[]) {
  innerLogger(`\n[${PLUGIN_NAME}]: `, ...contents);
}

export async function outputLog(contents: string[], outputFile?: string) {
  const formattedContents = contents.reduce(
    (last, current) => {
      last.push(`  ${current}`);
      return last;
    },
    [`[${PLUGIN_NAME}]:`],
  );

  if (outputFile) {
    await fs.writeFile(outputFile, formattedContents.join('\n'));
    innerLogger(
      `[${PLUGIN_NAME}]: `,
      `Unused source file entries write to: ${relative(
        process.cwd(),
        outputFile,
      )}`,
    );
  } else {
    // avoid logs mess up as: transforming (23) node_modules/.../dist/reactivity.[vite-plugin-deadfile]:
    await delay(1);

    for (const line of formattedContents) {
      innerLogger(line);
    }
  }
}
