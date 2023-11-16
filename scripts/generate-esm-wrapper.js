import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pkg from '../package.json' assert { type: 'json' };

const base = dirname(fileURLToPath(import.meta.url));
const esmFile = resolve(base, '..', pkg.exports.import);
const content = `import vitePluginDeadFile from './index.cjs';
export default vitePluginDeadFile;
`;

fs.writeFile(esmFile, content);
