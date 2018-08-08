# Working with Packages

As we are using `yarn` for managing packages, here are some helpful tips for
whenever you need to work with them.

### Offline by default

To ensure you have the right version of dependencies, run this command after
cloning or switching branches.

```sh
> yarn
```

This will restore the versions stored in the lock file to the `node_modules`
folder.

Yarn is enabled with local caches for the root dependencies and application
dependencies. These are located at the `vendor/cache` and `app/vendor/cache`
directories in the repository.

### Add new packages

Rather than updating the `package.json` explicitly, you can install new
dependencies via the `yarn` command line:

```sh
# adds the package to the dependencies list
> yarn add [package-name]
# adds the package to the devDependencies list
> yarn add -D [package-name]
```

### Updating packages

To see which packages have newer versions available:

```sh
> yarn outdated
```

To upgrade a package to it's latest version:

```sh
> yarn upgrade --latest [package-name]
```

To upgrade a package to a speific version (or [version range](https://docs.npmjs.com/misc/semver#x-ranges-12x-1x-12-)):

```sh
> yarn upgrade [package-name]@[version]
```

This will likely update the `vendor/cache` or `app/vendor/cache` directories
to add new packages or remove stale packages, so ensure these changes are
also included when committing.

### Removing packages

To remove any packages that are no longer needed:

```sh
> yarn remove [package-name]
```

Ensure that any `vendor/cache` or `app/vendor/cache` changes are also included
when committing to ensure stale packages are removed.