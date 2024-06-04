# vite-plugin-deadfile [![npm](https://img.shields.io/npm/v/vite-plugin-deadfile.svg)](https://npmjs.com/package/vite-plugin-deadfile)

This plugin helps to find unused source file(dead files) in Vite projects.

Features:
- Pure type reference could be detected with the help of `@swc/core`.
- Help to manage unused source files imported unintentionally by Vite's [dynamic import](https://vitejs.dev/guide/features.html#dynamic-import) feature.

```js
// vite.config.js
import { defineConfig } from 'vite';
import deadFile from 'vite-plugin-deadfile';

export default defineConfig({
  plugins: [deadFile({
    root: 'src',
  })],
});
```

## Output format

```text
[vite-plugin-deadfile]:
  All source files: 123
  Used source files: 120
  Unused source files: 3
    ./path/to/unused/file-a
    ./path/to/unused/file-b
    ./path/to/unused/file-c
```

## Options

### root 

A string. Project root directory. Can be an absolute path, or a path relative to the current working directory.

Defaults to '.'

### include

A valid [picomatch](https://github.com/micromatch/picomatch#globbing-features) pattern, or array of patterns.

Source files to be compared with files referenced during compilation.

If no value is provided, all files in the root directory will be considered as source files.

Please refer to https://www.npmjs.com/package/@rollup/pluginutils#createfilter for more detail.
```js
import { defineConfig } from 'vite';
import deadFile from 'vite-plugin-deadfile';

export default defineConfig({
  plugins: [deadFile({
    include: ['src/**']
  })],
});
```

### exclude

A valid [picomatch](https://github.com/micromatch/picomatch#globbing-features) pattern, or array of patterns.

Files to be configured as non-source files, so they won't appear in the result.

Please refer to https://www.npmjs.com/package/@rollup/pluginutils#createfilter for more detail.
```js
import { defineConfig } from 'vite';
import deadFile from 'vite-plugin-deadfile';

export default defineConfig({
  plugins: [deadFile({
    exclude: ['vendors/**', /\.md$/i]
  })],
});
```

> `node_modules` are excluded by default.

### includeHiddenFiles
Accept hidden files (file with a name start with `.`) as source files.

Default to false.

### output

Output file name may only contains number/letter/hyphen/underscore.

If no output file name is provided, the result will be printed on console.

```js
import { defineConfig } from 'vite';
import deadFile from 'vite-plugin-deadfile';

export default defineConfig({
  plugins: [deadFile({
    output: 'dead-files.txt'
  })],
});
```

### outputDir

Output file directory, support multiple formats: `/path/to/dir`, `./path/to/dir`, `path/to/dir`.

If no output dir is provided, `.` is used.

```js
import { defineConfig } from 'vite';
import deadFile from 'vite-plugin-deadfile';

export default defineConfig({
  plugins: [deadFile({
    outputDir: './output'
    output: 'dead-files.txt'
  })],
});
```

### throwWhenFound

Could be a boolean or a number.

If `throwWhenFound` is set to `true`, the build process will abort when any unused source files are found.

If `throwWhenFound` is set to `10`, the build process will abort when 10 or more unused source files are found.

If no `throwWhenFound` is provided, `false` is used.

```js
import { defineConfig } from 'vite';
import deadFile from 'vite-plugin-deadfile';

export default defineConfig({
  plugins: [deadFile({
    // if 10 or more unused source files are found
    // you CI/CD process will abort
    throwWhenFound: 10
  })],
});
```

### isDynamicModuleLive

Vite has a [dynamic import](https://vitejs.dev/guide/features.html#dynamic-import) feature which will imports source files with [glob-import](https://vitejs.dev/guide/features.html#glob-import).

The problem with glob-import is it breaks the 'detect dead files by references' assumption of this plugin. So the life or death situation of glob-imported files have to be listed explicitly.

`isDynamicModuleLive` is a callback which receives the relative file path as the parameter. If the file is still useful, the callback returns `true`.

Generally, you could match the given file path to your router config because most glob-import happen in the router and if a page is not used, it will be removed from the route config.

```js
import { defineConfig } from 'vite';
import deadFile from 'vite-plugin-deadfile';
import routeInfo from './my-route-config';

function fileIsUsedInRouter(file) {
  // implement this function according to your route config
  return routeInfo.includes(file);
}

export default defineConfig({
  plugins: [deadFile({
    isDynamicModuleLive: (file) => {
      return fileIsUsedInRouter(file);
    }
  })],
});
```

## Caveats

### Check before deleting
Some unreferenced files such as markdowns may be useful, check again before deleting those files.

### Passively imported Type Declaration files can NOT be traced
Type files imported explicitly could be traced. Type Declarations like `vite/client.d.ts` loaded passively could NOT be traced. You could put them in the `exclude` config.

### Pure Type Reference can NOT be traced

>__Update__: After v1.1.0 `@swc/core` is being used to scan import statement in source files, it is traceable now. Still, be aware that the scan could go wrong in edge cases. Please check again before removing any source files and report those issues on github.

Imported typescript files only have their interfaces or types being referenced will not be marked as used.

In the following example, `interface-a.ts` will NOT be marked as used.

```typescript
// interface-a.ts
export interface A {}

// index.ts
import type { A } from './interface-a';
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
