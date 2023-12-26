# Changelog
# [1.1.2](https://github.com/stauren/vite-plugin-deadfile/tree/v1.1.2) (2023-12-26)
- Add a new config `outputDir`

# [1.1.1](https://github.com/stauren/vite-plugin-deadfile/tree/v1.1.1) (2023-12-13)
- Fix a bug caused in dev mode

# [1.1.0](https://github.com/stauren/vite-plugin-deadfile/tree/v1.1.0) (2023-12-12)
- Using '@swc/core' to parse import statement in order to avoid mark pure-type reference as unused source files
- Use `createFilter` from vite instead of @rollup/pluginutils
- Change building tool from rollup to vite

# [1.0.5](https://github.com/stauren/vite-plugin-deadfile/tree/v1.0.5) (2023-11-22)
- Remove log

# [1.0.4](https://github.com/stauren/vite-plugin-deadfile/tree/v1.0.4) (2023-11-22)
- Using @rollup/pluginutils to handle "include" and "exclude" config as file filter
- Add a new config `includeHiddenFiles`
- Fix a bug when using relative path as `root` (by @arnriu)
- Merge the plugin's first param `projectRoot` in to the config object. (by @arnriu)

# [1.0.3](https://github.com/stauren/vite-plugin-deadfile/tree/v1.0.3) (2023-11-16)
- Fix a missing dist file bug

# [1.0.2](https://github.com/stauren/vite-plugin-deadfile/tree/v1.0.2) (2023-11-16)
- Support cjx export https://github.com/stauren/vite-plugin-deadfile/issues/2

# [1.0.1](https://github.com/stauren/vite-plugin-deadfile/tree/v1.0.1) (2023-11-14)
- Fix a esm related bug

# [1.0.0](https://github.com/stauren/vite-plugin-deadfile/tree/v1.0.0) (2023-11-14)
- First version of vite-plugin-deadfile
