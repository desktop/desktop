# Coding Style

For the most part we're just sticking to vanilla TypeScript and using TSLint to enforce this standard, but here's a couple of additional things to look for:

## Visibility of AppStore Methods

The [`Dispatcher`](https://github.com/desktop/desktop/blob/master/app/src/lib/dispatcher/dispatcher.ts)
is the entry point for most interactions with the application which update state,
and for most usages this work is then delegated to the [`AppStore`](https://github.com/desktop/desktop/blob/master/app/src/lib/dispatcher/app-store.ts).
Due to this coupling, we need to discourage callers directly manipulating
specific methods in the `AppStore` unless there's a compelling reason.

We do this by making the methods look unappealing:

 - underscore prefix on method name
 - comment indicating that you should be looking elsewhere

```ts
  /** This shouldn't be called directly. See `Dispatcher`. */
  public async _repositoryWithRefreshedGitHubRepository(repository: Repository): Promise<Repository> {
    ...
  }
```
