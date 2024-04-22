# Changelog
## [1.2.4](https://github.com/stauren/vite-plugin-deadfile/tree/v1.2.4) (2024-04-22)
- fix an error when build fails falsy dead files list is given

## [1.2.3](https://github.com/stauren/vite-plugin-deadfile/tree/v1.2.3) (2024-04-09)
- fix https://github.com/stauren/vite-plugin-deadfile/issues/16, an error message falsely popup when the outputDir is the root dir, better win path format support
- change the plugin name to be more traceable
- refactor logger a bit

## [1.2.2](https://github.com/stauren/vite-plugin-deadfile/tree/v1.2.2) (2024-04-07)
- Fix a bug that an illegal import will break the plugin (import a subpath not specified in exports field of package.json)
- Fix a bug that dynamic import is not detected when it's not wrapped in an arrow function
- Only ts and tsx files are parsed in the pre phase now for pure type reference, speed up!

## [1.2.1](https://github.com/stauren/vite-plugin-deadfile/tree/v1.2.1) (2024-01-16)
- Fix "The CJS build of Vite's Node API is deprecated" warning
- Add biome to check source code.

## [1.2.0](https://github.com/stauren/vite-plugin-deadfile/tree/v1.2.0) (2024-01-15)
- Add a new config `isDynamicModuleLive`, Vite's `dynamic-import` modules could be better managed.
- `throwWhenFound` also accept a number format parameter.
- Split the plugin into 2 Vite plugins underneath because type reference must be done in the 'pre' phase and glob-import analysis must be done in the 'post' phase.
- Refactor some code and a new class `FileMarker` is abstracted.

## [1.1.3](https://github.com/stauren/vite-plugin-deadfile/tree/v1.1.3) (2024-01-08)
- Add a new config `throwWhenFound`

## [1.1.2](https://github.com/stauren/vite-plugin-deadfile/tree/v1.1.2) (2023-12-26)
- Add a new config `outputDir`

## [1.1.1](https://github.com/stauren/vite-plugin-deadfile/tree/v1.1.1) (2023-12-13)
- Fix a bug caused in dev mode

## [1.1.0](https://github.com/stauren/vite-plugin-deadfile/tree/v1.1.0) (2023-12-12)
- Using '@swc/core' to parse import statement in order to avoid mark pure-type reference as unused source files
- Use `createFilter` from vite instead of @rollup/pluginutils
- Change building tool from rollup to vite

## [1.0.5](https://github.com/stauren/vite-plugin-deadfile/tree/v1.0.5) (2023-11-22)
- Remove log

## [1.0.4](https://github.com/stauren/vite-plugin-deadfile/tree/v1.0.4) (2023-11-22)
- Using @rollup/pluginutils to handle "include" and "exclude" config as file filter
- Add a new config `includeHiddenFiles`
- Fix a bug when using relative path as `root` (by @arnriu)
- Merge the plugin's first param `projectRoot` in to the config object. (by @arnriu)

## [1.0.3](https://github.com/stauren/vite-plugin-deadfile/tree/v1.0.3) (2023-11-16)
- Fix a missing dist file bug

## [1.0.2](https://github.com/stauren/vite-plugin-deadfile/tree/v1.0.2) (2023-11-16)
- Support cjx export https://github.com/stauren/vite-plugin-deadfile/issues/2

## [1.0.1](https://github.com/stauren/vite-plugin-deadfile/tree/v1.0.1) (2023-11-14)
- Fix a esm related bug

## [1.0.0](https://github.com/stauren/vite-plugin-deadfile/tree/v1.0.0) (2023-11-14)
- First version of vite-plugin-deadfile
