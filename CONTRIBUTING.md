# Contributing to GitHub Desktop

Please take some time out to read these resources before you start contributing
changes to GitHub Desktop.

## Setup

You will need to install these tools:

 - [Nodejs](https://nodejs.org) v7 is preferred as it's the version embedded into Electron
    - **Windows developers**:  Make sure you allow the Node.js installer to add
      node to the PATH, it'll make life much easier for you.
 - Python 2.7 - [Windows](https://www.python.org/downloads/windows/), [macOS](https://www.python.org/downloads/mac-osx/)
    - **Windows developers**: Let python install into the default suggested path
      (`c:\Python27`), otherwise you'll have to configure node-gyp manually with
      the path which is annoying.
 - **macOS:** Xcode and Xcode Command Line Tools (Xcode -> Preferences -> Downloads)
 - **Windows:** Visual Studio 2015 or [Visual C++ Build Tools](http://go.microsoft.com/fwlink/?LinkId=691126)
    - Run `npm config set msvs_version 2015` after installing the build tools

With these things installed, open a shell and validate your output to these commands looks like this:

```
> node -v
v7.8.0

> npm -v
4.2.0

> python --version
Python 2.7.13
```

We also have some [additional resources](./docs/contributing/tooling.md) to help you configure
favourite editor to work nicely with the GitHub Desktop repository.

## Building

After cloning the repository, the typical workflow to get the app up and running
is as follows:

* Run `npm install` to get all required dependencies on your machine.
* Run `npm run build:dev` to make a development build of the app.
* Run `npm start` to launch the application. Changes will be compiled in the
  background. The app can then be reloaded to see the changes (Ctrl/Command+R).

If you've made changes in the main-process folder you need to run `npm run
rebuild:dev` and then `npm run start` for these changes to be reflected.

If you're still encountering issues with building, refer to our
[troubleshooting](./docs/contributing/troubleshooting.md) guide for more common
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

This example will run all tests matching `CloneProgressParser`.

## Debugging

Electron ships with Chrome Dev Tools to assist with debugging, profiling and
other measurement tools.

1. Run the command `npm start` to launch the app
2. Open _Chrome Dev Tools_

[React Dev
Tools](https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi?hl=en)
should automatically install itself on first start when in development mode.

If you would also like to use [Devtron](http://electron.atom.io/devtron/), run
the command `require('devtron').install()` inside of the console in _Chrome Dev
Tools_.

## The Next Steps

You've made it to here, so let's give you some other things to read to get you started:

 - [Up for Grabs](./docs/process/up-for-grabs.md) - we've marked some tasks in
   the backlog that are ideal for external contributors
 - [Code Reviews](./docs/process/reviews.md) - some notes on how the team does
   code reviews
