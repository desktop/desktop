# Working with Packages

As we are using `yarn` for managing packages, here are some helpful tips for
whenever you need to work with them.

### Install packages

To ensure you have the right version of dependencies, run this command after
cloning or switching branches.

```sh
> yarn
```

This will restore the versions stored in the lock file to the `node_modules`
folder.

### Add new packages

Rather than updating the `package.json` explicitly, you can install new
dependencies via the `yarn` command line:

```sh
# adds the package to the dependencies list
> yarn add [package-name]
# adds the package to the devDependencies list
> yarn add [package-name] --dev
```

### Updating packages

To see which packages have newer versions available:

```sh
> yarn outdated
```

To upgrade a package:

```sh
> yarn upgrade [package-name]@[version]
```

You don't _need_ to specify the version here, but this ensures the change is
reflected in the `package.json` file.

### Removing packages

To remove any packages that are no longer needed:

```sh
> yarn remove [package-name]
```