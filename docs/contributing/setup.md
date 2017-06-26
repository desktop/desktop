#  Development Environment Setup

## Setup

You will need to install these tools on your machine:

### macOS

 - [Node.js v7](https://nodejs.org/en/download/current) - this is the version embedded into Electron
 - [Python 2.7](https://www.python.org/downloads/mac-osx/)
 - Xcode and Xcode Command Line Tools (Xcode -> Preferences -> Downloads)

### Windows

 - [Node.js v7](https://nodejs.org/en/download/current) - this is the version embedded into Electron
    - *Make sure you allow the Node.js installer to add node to the PATH.*
 - [Python 2.7](https://www.python.org/downloads/windows/)
    - *Let Python install into the default suggested path (`c:\Python27`), otherwise you'll have
      to configure node-gyp manually with the path which is annoying.*
    - *Ensure the **Add python.exe to Path** option is selected.*
 - Visual Studio 2015 or [Visual C++ Build Tools](http://go.microsoft.com/fwlink/?LinkId=691126)
    - *If you already have Visual Studio 2015 installed, ensure you have the **Common Tools for Visual C++ 2015**
      feature as that is required by Node.js for installing native modules.*
    - *Visual Studio 2017 support has not been tested yet - see [#1766](https://github.com/desktop/desktop/issues/1766) for details*
 - *Run `npm config set msvs_version 2015` to tell node the right toolchain to use for compiling native modules.*

## Verification

With these things installed, open a shell and validate you have these commands
available and that the versions look similar:

```
> node -v
v7.8.0

> npm -v
4.2.0

> python --version
Python 2.7.13
```

There are also [additional resources](tooling.md) to
configure your favorite editor to work nicely with the GitHub Desktop
repository.

## Building Desktop

After cloning the repository, the typical workflow to get up running
is as follows:

* Run `npm install` to get all required dependencies on your machine.
* Run `npm run build:dev` to create a development build of the app.
* Run `npm start` to launch the application. Changes will be compiled in the
  background. The app can then be reloaded to see the changes (Ctrl/Command+R).

If you've made changes in the `main-process` folder you need to run `npm run
build:dev` to rebuild the package, and then `npm start` for these changes to be
reflected in the running app.

If you're still encountering issues with building, refer to our
[troubleshooting](troubleshooting.md) guide for more common
problems.

## Running tests

- `npm test` - Runs all unit and integration tests
- `npm run test:unit` - Runs all unit tests
- `npm run test:integration` - Runs all integration tests

**Pro Tip:** If you're only interested in the results of a single test and don't
wish to run the entire test suite to see it you can pass along a search string
in order to only run the tests that match that string.

```
npm run test:unit -- --grep CloneProgressParser
```

This example will run all test names containing `CloneProgressParser`.

## Debugging

Electron ships with Chrome Dev Tools to assist with debugging, profiling and
other measurement tools.

1. Run the command `npm start` to launch the app
2. Under the **View** menu, select **Toggle Developer Tools**

When running the app in development mode,
[React Dev Tools](https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi?hl=en)
should automatically install itself on first start when in development mode.

An additional extension, [Devtron](http://electron.atom.io/devtron/), is also
included but is disabled by default. To enable Devtron, select the Console
tab in Chrome Developer Tools and run this command:

```js
require('devtron').install()
```

## The Next Steps

You're almost there! Here's a couple of things we recommend you read next:

 - [Up for Grabs](../../CONTRIBUTING.md#up-for-grabs) - we've marked some tasks in
   the backlog that are ideal for external contributors
 - [Code Reviews](../process/reviews.md) - some notes on how the team does
   code reviews
