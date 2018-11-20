# Linting

[What is linting, anyways?](https://en.wikipedia.org/wiki/Lint_%28software%29)

## Tooling

Our linting tooling uses a combination of

* [prettier](https://github.com/prettier/prettier)
* [eslint](https://github.com/eslint/eslint)
* [tslint](https://github.com/palantir/tslint).

Most (if not all) editors have integrations for these tools so that they will report errors and fix formatting in realtime. See [tooling](./tooling.md) for how to set these integrations up while developing for desktop.

## Running Checks

Use

```shellsession
$ yarn lint
```

in your local repository to run all linting checks. Each tool will report their errors on the command line.

## Fixing Issues

Some issues found by linters can be automatically fixed. Use

```shellsession
$ yarn lint:fix
```

to automatically fix them. If any issues remain, you'll have to fix them manually (and the output will tell you that).

## Continuous Integration (CI)

Each of our CI services also runs linting checks on [open pull requests](https://github.com/desktop/desktop/pulls) in the GitHub Desktop repository. Pull requests must pass CI to before we accept them, so don't forget to lint locally.