# vite-plugin-deadfile [![npm](https://img.shields.io/npm/v/vite-plugin-deadfile.svg)](https://npmjs.com/package/vite-plugin-deadfile)

This plugin helps you find unused source file(dead files) in your project.

```js
// vite.config.js
import { defineConfig } from 'vite';
import deadFile from 'vite-plugin-deadfile';

export default defineConfig({
  plugins: [deadFile()],
});
```

## Options

### include

An array of source files/folders to be compared with files referenced during compilation.

If no value is provided, all files in the root directory will be considered as source files.
```js
import { defineConfig } from 'vite';
import deadFile from 'vite-plugin-deadfile';

export default defineConfig({
  plugins: [deadFile(
    include: ['src']
  )],
});
```

### exclude

An array of files/folders to be configured as non-source files, so they won't appear in the result.

```js
import { defineConfig } from 'vite';
import deadFile from 'vite-plugin-deadfile';

export default defineConfig({
  plugins: [deadFile(
    include: ['src'],
    exclude: ['src/vendors']
  )],
});
```

> `node_modules` and hidden files (file with a name start with `.`) are excluded by default.

### output

Output file name may only contains number/letter/hyphen/underscore.

If no output file name is provided, the result will be printed on console.

```js
import { defineConfig } from 'vite';
import deadFile from 'vite-plugin-deadfile';

export default defineConfig({
  plugins: [deadFile(
    output: 'dead-files.txt'
  )],
});
```

## Output format

```text
All source files: 123
Used source files: 120
Unused source files: 3
  ./path/to/unused/file-a
  ./path/to/unused/file-b
  ./path/to/unused/file-c
```

## Caveats

### Pure Type Reference can NOT be traced
Imported typescript files only have their interfaces or types being referenced will not be marked as used.

In the following example, `interface-a.ts` will NOT be marked as used.

```typescript
// interface-a.ts
export interface A {}

// index.ts
import type { A } from '.interface-a';
export function main(param: A) {}
```
This is because vite use rollup to build a project. Since rollup only build javascript files, a typescript file must be transformed into javascript before handing to rollup, vite does this with [esbuild plugin](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/plugins/esbuild.ts) in transform hook:

```typescript
  // vite/src/node/plugins/esbuild.ts
  async transform(code, id) {
    if (filter(id) || filter(cleanUrl(id))) {
      // transform ts into js with esbuild
      const result = await transformWithEsbuild(code, id, transformOptions)
      if (result.warnings.length) {
        result.warnings.forEach((m) => {
          this.warn(prettifyMessage(m, code))
        })
      }
      if (jsxInject && jsxExtensionsRE.test(id)) {
        result.code = jsxInject + ';' + result.code
      }
      return {
        code: result.code,
        map: result.map,
      }
    }
  },
```

Similarly, [@rollup/plugin-typescript](https://github.com/rollup/plugins/blob/master/packages/typescript/src/index.ts#L161) uses the content of pre-compiled javascript files of requested typescript files in `load` hook to do the trick.

Either way, the imports of pure type references are lost after files are compiled into javascript. So they will be wrongly considered as not used.

There are several tsconfig about the elimination of type imports: `verbatimModuleSyntax`, `preserveValueImports`, `importsNotUsedAsValues`. It seems they are either not useful or conflicting with vite, so it not possible to trace the references of pure types for now.

### Check before delete
Some unreferenced files such as markdowns may be useful, check again before deleting those files.