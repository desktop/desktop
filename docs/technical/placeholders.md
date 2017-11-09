## Placeholders and Replacements in Source Code

As GitHub Desktop uses Webpack to transpile, minify and merge our code
into unified scripts for each configuration we define, we use some tricks
to manage complexity and enable some optimizations.

For example, you might come across this code in [`app-window.ts`](https://github.com/desktop/desktop/blob/master/app/src/main-process/app-window.ts):

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

The replacements defined for Desktop are found in [`app/app-info.js`](https://github.com/desktop/desktop/blob/master/app/app-info.js)
as a hash of key-value pairs.

```ts
function getReplacements() {
  const replacements = {
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

  ...
}
```

This means we can embed values at build time based on the current platform.
Note the values we are embeddeding for `__DARWIN__` and `__WIN32__`:

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
globals under [`app/src/lib/globals.ts`](https://github.com/desktop/desktop/blob/master/app/src/lib/globals.d.ts).

For example, the values for `__DARWIN__` and `__WIN32__` are declared as
booleans.

```ts
/** Is the app being built to run on Darwin? */
declare const __DARWIN__: boolean

/** Is the app being built to run on Win32? */
declare const __WIN32__: boolean
```

As a convention, globals which should be replaced by Webpack should be prefixed
with two underscores, e.g. `__DEV__`.

### Platform-specific Menu Items

There are a few places in Desktop where a label depends on the platform the
app is executing on. For the most part, we use "CamelCase" for labels on macOS
and "Sentence case" on Windows and Linux, like this:

```ts
  {
    id: 'view-repository-on-github',
    label: __DARWIN__ ? 'View on GitHub' : '&View on GitHub',
    accelerator: 'CmdOrCtrl+Shift+G',
    click: emit('view-repository-on-github'),
  },
```

Note how the Windows case has a `&` prefixing the `V` - this is so you can
select the menu item directly by pressing <kbd>ALT</kbd>, then <kbd>V</kbd>.

For situations where a menu item needs to display something unique for each
platform, these should be defined as placeholders. The prefix `__MENU_` should
be used to group these.

The corresponding platform-specific values must be added to [`app/app-info.js`](https://github.com/desktop/desktop/blob/master/app/app-info.js),
in the `getMenuPlaceholders()` function:

```ts
function getMenuPlaceholders() {
  if (process.platform === 'darwin') {
    return {
      __MENU_SHOW_LOGS_IN_FILE_MANAGER__: s('Show Logs in Finder'),
      __MENU_SHOW_IN_FILE_MANAGER__: s('Show in Finder'),
    }
  }

  if (process.platform === 'win32') {
    return {
      __MENU_SHOW_LOGS_IN_FILE_MANAGER__: s('S&how Logs in Explorer'),
      __MENU_SHOW_IN_FILE_MANAGER__: s('Show in E&xplorer'),
    }
  }

  // other platforms follow
}
```

As ensure these placeholders as added as globals under
[`app/src/lib/globals.ts`](https://github.com/desktop/desktop/blob/master/app/src/lib/globals.d.ts).


```ts
/**
 * These menu entries are separated because Windows and Linux can use
 * chords to select a menu item immediately. They need to be reviewed
 * to ensure no clashes wtih other shortcuts.
 */
declare const __MENU_SHOW_LOGS_IN_FILE_MANAGER__: string
declare const __MENU_SHOW_IN_FILE_MANAGER__: string
```

### Platform-specific Labels

For other places in the user interface that still differ per-platform,
the `getPlatformPlaceholders()` method should contain all the necessary
values:

```js
function getPlatformPlaceholders() {
  if (process.platform === 'darwin') {
    return {
      __LABEL_SHOW_IN_FILE_MANAGER__: s('Show in Finder'),
      __LABEL_REVEAL_IN_FILE_MANAGER__: s('Reveal in Finder'),
      __LABEL_FILE_MANAGER_NAME__: s('Finder'),
    }
  }
  if (process.platform === 'win32') {
    return {
      __LABEL_SHOW_IN_FILE_MANAGER__: s('Show in Explorer'),
      __LABEL_REVEAL_IN_FILE_MANAGER__: s('Show in Explorer'),
      __LABEL_FILE_MANAGER_NAME__: s('Explorer'),
    }
  }
  // other platforms follow
}
```

These placeholders all use the `__LABEL_` prefix to distinguish them from
assist with grouping.
