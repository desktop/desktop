# TypeScript Style Guide

Most of our preferred style when writing typescript is configured in our [`tslint.json`](../../tslint.json) and [`.eslintrc.yml`](../../.eslintrc.yml) files.

## Do
 - Use camelCase for methods
 - Use PascalCase for class names
 - Enable [TSLint](https://palantir.github.io/tslint/usage/third-party-tools/) and [ESLint](https://eslint.org/docs/user-guide/integrations) in your editor

# Documenting your code

We currently use [JSDoc](http://usejsdoc.org/) even though we don't currently generate any documentation or
verify the format. We're using JSDoc over other formats because the typescript compiler has built-in support
for parsing jsdoc and presenting it in IDEs.

While there doesn't appear to be any well-used typescript documentation export utilities out there at the
moment we hope that it's only a matter of time. JSDoc uses a lot of metadata that is already self-documented
in the typescript type system such as visibility, inheritance, membership.

For now all you need to know is that you can document classes, methods, properties and fields by using the
following formatted comment on the line above whatever you're trying to document.

```ts
/** This is a documentation string */
```

The double start `/**` opener is the key. It has to be exactly two stars for it to be a valid JSDoc open token.

If you need multiple lines to describe the subject try to sum up the thing you're describing in a short title
and leave a blank line before you go into detail, similar to a git commit message.

```ts
/**
 * This is a title, keep it short and sweet
 *
 * Go nuts with documentation here and in more paragraphs if you need to.
 */
```

## Visibility of AppStore Methods

The [`Dispatcher`](https://github.com/desktop/desktop/blob/master/app/src/lib/dispatcher/dispatcher.ts)
is the entry point for most interactions with the application which update state,
and for most usages this work is then delegated to the [`AppStore`](https://github.com/desktop/desktop/blob/master/app/src/lib/stores/app-store.ts).
Due to this coupling, we need to discourage callers directly manipulating
specific methods in the `AppStore` unless there's a compelling reason.

We do this by making the methods look unappealing:

 - underscore prefix on method name
 - comment indicating that you should be looking elsewhere

```ts
/** This shouldn't be called directly. See `Dispatcher`. */
public async _repositoryWithRefreshedGitHubRepository(repository: Repository): Promise<Repository> {
  // ...
}
```

## Asynchronous and Synchronous Node APIs

### Application Code

We should be using asynchronous core APIs throughout the application, unless
there's a compelling reason and no asynchronous alternative. In those cases the
method should be suffixed with `Sync` to make it clear to the caller what's
happening. We also fall back to `Sync` methods for readability in tests.

We use [an ESLint rule](https://eslint.org/docs/rules/no-sync) to enforce
this standard.

### Scripts

For scripts we should favor synchronous APIs as the asynchronous benefits are
not so important there, and  it makes the code easier to read.
