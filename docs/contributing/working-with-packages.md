# Working with Packages

Desktop uses the npm version bundled with the Node.js version in `.nvmrc`.
Build dependencies live in the root `package.json`; application dependencies
live in `app/package.json`. Each has its own `package-lock.json`.

### Install packages

To ensure you have the right version of dependencies, run this command after
cloning or switching branches.

```sh
> npm ci
```

This restores the locked versions to `node_modules`. The root postinstall also
installs the application dependencies, downloads Electron, initializes
submodules, and checks the build scripts. Application packages are installed
afresh so edited native sources rebuild after switching branches. CI uses the
same command and fails if a manifest and its lockfile disagree.

Use `npm install` when updating a manifest and its lockfile. For application
dependencies, use `npm install --prefix app`; do not add them to the root package.
Commit the corresponding `package.json` and `package-lock.json` together.

### Add new packages

Rather than updating the `package.json` explicitly, you can install new
dependencies via the npm command line:

```sh
# adds the package to the dependencies list
> npm install [package-name]
# adds the package to the devDependencies list
> npm install --save-dev [package-name]
# adds an application dependency
> npm install --prefix app [package-name]
```

### Updating packages

To see which packages have newer versions available:

```sh
> npm outdated
# checks application dependencies
> npm outdated --prefix app
```

To upgrade a package to its latest version:

```sh
> npm install [package-name]@latest
```

To upgrade a package to a specific version (or [version range](https://docs.npmjs.com/misc/semver#x-ranges-12x-1x-12-)):

```sh
> npm install [package-name]@[version]
```

### Removing packages

To remove any packages that are no longer needed:

```sh
> npm uninstall [package-name]
```

### Running scripts and tools

Use `npm run [script-name]` for scripts in `package.json`, or `npm test` and
`npm start` for their standard aliases. Put script arguments after `--`:

```sh
> npm test -- app/test/unit/repository-list-test.ts
> npm run prettier -- --write
> npm exec -- tsc --noEmit
```

### Dependency compatibility

Project `.npmrc` files preserve the previous install behavior: the public npm
registry, no minimum release age, no automatic peer dependency installation
(`legacy-peer-deps=true`), and copies of local `file:` packages
(`install-links=true`). Native packages build in `node_modules`, not their source
directories. Keep these settings consistent when updating lockfiles.

The lockfiles preserve the original direct, transitive, and optional dependency
pins and integrity checks. Nested versions are retained where needed instead of
deduplicating to a different version that also satisfies the dependency range.
Use `npm ci` for reproducible installs and explicit update commands for intentional
dependency upgrades.

Cross-compilation installs build tools for the host CPU, but application optional
packages for the target CPU via npm's `--cpu` option. This includes the Copilot
SDK runtime and Koffi native package.
