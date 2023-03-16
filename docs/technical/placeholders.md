## Placeholders and Replacements in Source Code

As GitHub Desktop uses Webpack to transpile, minify and merge our code
into unified scripts for each configuration we define, we use some tricks
to manage complexity and enable some optimizations.

For example, you might come across this code in [`app-window.ts`](https://github.com/desktop/desktop/blob/development/app/src/main-process/app-window.ts):

```ts
if (__DARWIN__) {
  windowOptions.titleBarStyle = 'hidden'
} else if (__WIN32__) {
  windowOptions.frame = false
}
```

You may be inclined to refactor this to be:

```ts
if (process.platform === 'darwin') {
  windowOptions.titleBarStyle = 'hidden'
} else if (process.platform === 'win32') {
  windowOptions.frame = false
}
```

And while both of these are semantically the same, how we bundle Desktop means
we get significant benefits from doing it the first way.

### Replacements

The replacements defined for Desktop are found in [`app/app-info.ts`](https://github.com/desktop/desktop/blob/development/app/app-info.ts)
as a hash of key-value pairs.

```ts
function getReplacements() {
  return {
    __OAUTH_CLIENT_ID__: s(process.env.DESKTOP_OAUTH_CLIENT_ID || devClientId),
    __OAUTH_SECRET__: s(
      process.env.DESKTOP_OAUTH_CLIENT_SECRET || devClientSecret
    ),
    __DARWIN__: process.platform === 'darwin',
    __WIN32__: process.platform === 'win32',
    __LINUX__: process.platform === 'linux',
    __DEV__: channel === 'development',
    __RELEASE_CHANNEL__: s(channel),
    __UPDATES_URL__: s(distInfo.getUpdatesURL()),
    __SHA__: s(gitInfo.getSHA()),
    __CLI_COMMANDS__: s(getCLICommands()),
    'process.platform': s(process.platform),
    'process.env.NODE_ENV': s(process.env.NODE_ENV || 'development'),
    'process.env.TEST_ENV': s(process.env.TEST_ENV),
  }
}
```

This means we can embed values at build time based on the current platform.
Note the values we are embedding for `__DARWIN__` and `__WIN32__`:

```ts
__DARWIN__: process.platform === 'darwin',
__WIN32__: process.platform === 'win32',
```

Because we evaluate these values at build time, the original code snippet will
now look like this on macOS:

```js
if (true) {
  windowOptions.titleBarStyle = 'hidden'
} else if (false) {
  windowOptions.frame = false
}
```

And look like this on Windows:

```js
if (false) {
  windowOptions.titleBarStyle = 'hidden'
} else if (true) {
  windowOptions.frame = false
}
```

As part of Webpack's minification and bundling, the dead code paths are
eliminated, leaving this code for macOS:

```js
windowOptions.titleBarStyle = 'hidden'
```

And this code for Windows:

```js
windowOptions.frame = false
```

This means less code is emitted as part of the packaged app, and less
JavaScript is interpreted and executed at runtime.

### Placeholders

As we are working in TypeScript, we need to define these placeholders as
globals under [`app/src/lib/globals.ts`](https://github.com/desktop/desktop/blob/development/app/src/lib/globals.d.ts)
to provide the appropriate type information to the source code.

For example, the values for `__DARWIN__` and `__WIN32__` are declared as
booleans.

```ts
/** Is the app being built to run on Darwin? */
declare const __DARWIN__: boolean

/** Is the app being built to run on Win32? */
declare const __WIN32__: boolean
```

As a convention, globals which should be replaced by Webpack should be prefixed
and suffixed with two underscores, e.g. `__DEV__`.
