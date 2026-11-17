# @faheem/config

Shared tooling config for every app in this monorepo.

| Export | Use it in an app |
|---|---|
| `@faheem/config/tsconfig.base.json` | `"extends": "@faheem/config/tsconfig.base.json"` in the app's `tsconfig.json` |
| `@faheem/config/eslint` | `export { default } from '@faheem/config/eslint';` in `eslint.config.js` (add `eslint` as a devDependency) |
| `@faheem/config/prettier` | Already applied repo-wide by the root `.prettierrc` |

`apps/web` keeps its original `src/tsconfig.json` on purpose so its build output stays identical.
