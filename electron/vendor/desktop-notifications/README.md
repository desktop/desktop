# desktop-notifications

## A simple and opinionated library for working with OS notifications

## Goals

- zero dependencies
- good support for Windows notifications
- leverage TypeScript declarations wherever possible

**Note:** This is currently in preview, with support for features that GitHub
Desktop uses.

## But Why?

The current set of options for interacting with notifications, especially on
Windows, have some limitations that meant we couldn't use them easily in GitHub
Desktop:

- [`electron`](https://www.electronjs.org/) doesn't support Windows
  notifications when those are hidden away in the Action Center, because it
  doesn't have a COM activator that could leverage CLSID-based activation. More
  details about this can be found in
  [electron/electron#29461](https://github.com/electron/electron/issues/29461).
- [`node-notifier`](https://www.npmjs.com/package/node-notifier) relies on
  [`snoretoast`](https://github.com/KDE/snoretoast) to handle notifications on
  Windows, and the way it's used is only able to detect one event with each
  notification, and also requires the app to use the same CLSID that is
  [hardcoded](https://github.com/KDE/snoretoast/blob/17f88b2c757d54581bb7d5aa4d0d4462c3e75a98/CMakeLists.txt#L5)
  in snoretoast.
- [`electron-windows-notifications`](https://github.com/felixrieseberg/electron-windows-notifications)
  has **many** dependencies around [`NodeRT`](https://github.com/NodeRT/NodeRT)
  which, as of today, also require some
  [manual steps](https://stackoverflow.com/a/54591996/673745) in order to build
  them.

After exploring all these options, we decided to write our own library to do the
stuff we require using no dependencies at all and having all the features we
need.

## Documentation

See the documentation under the
[`docs`](https://github.com/desktop/desktop-notifications/tree/master/docs)
folder.

## Supported versions

Each release of `desktop-notifications` includes prebuilt binaries based on
[N-API](https://nodejs.org/api/n-api.html), with support for different versions
of Node and Electron. Please refer to the
[N-API version matrix](https://nodejs.org/api/n-api.html#node-api-version-matrix)
and the release documentation for [Node](https://github.com/nodejs/Release) and
[Electron](https://electronjs.org/docs/tutorial/support) to see what is
supported currently.

## Contributing

Read the
[Setup](https://github.com/desktop/desktop-notifications/blob/master/docs/index.md#setup)
section to ensure your development environment is setup for what you need.

This project isn't about implementing a 1-1 replication of any other
notifications API, but implementing just enough for whatever usage GitHub
Desktop needs.

If you want to see something supported, open an issue to start a discussion
about it.
