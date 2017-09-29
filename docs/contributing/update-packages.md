# Updating Packages

As we are using `yarn` for managing packages, here are some helpful tips to ensure things stay in sync.

### Installing packages

To ensure you have the right version of dependencies, just run this command
after cloning or switching branches.

```sh
> yarn
```

This will restore the versions stored in the lock file to the `node_modules`
folder.

### Updating packages

To see which packages have newer versions available:

```sh
> yarn outdated
```

To then upgrade a package:

```sh
> yarn upgrade [package-name]@[version]
```

You don't _need_ to specify the version here, but this ensures the change is
reflected in the `package.json` file.