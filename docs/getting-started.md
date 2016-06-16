# Getting started

## Prerequisites

### Node.js

We use some ES6+ language constructs in our build scripts so you need [Node.js](https://nodejs.org) 6+ (just pick whatever the 'current' release is at the moment). Node 6 comes with npm 3 out of the box and while npm 3 isn't strictly necessary to build it does make things more efficient, especially on Windows where deep folder hierarchies can be detrimental to build speed.

*Windows only: Make sure you allow the Node.js installer to add node to the PATH, it'll make life much easier for you*

### node-gyp

node-gyp is required to build some of our native npm packages (such as [keytar](https://github.com/atom/node-keytar))

* Install python 2.7 ([Windows](https://www.python.org/downloads/windows/), [MacOS](https://www.python.org/downloads/mac-osx/))
* **MacOS:** Xcode and Xcode Command Line Tools (Xcode -> Preferences -> Downloads)
* **Windows:** Visual Studio 2015 or [Visual C++ Build Tools](http://go.microsoft.com/fwlink/?LinkId=691126)
  * Run `npm config set msvs_version 2015` after installing the build tools

*Windows only*: Let python install into the default suggested path (`c:\Python27`), don't try to move it into Program Files or else you'll have to configure node-gyp manually with the path.

## Building

* Run `npm install` to get all required dependencies on your machine.
* Run `npm start` to compile and launch the application. After it's successfully launched you can make changes which will be compiled in the background and these changes will either be hot-loaded into the app (if possible) or accessed by reloading the app (Ctrl/Command+R).

## Using Atom?

If you're using [Atom](https://atom.io/) there's some plugins that you might want to install

* [atom-typescript](https://atom.io/packages/atom-typescript) - Syntax highlighting and intellisense for TypeScript
* [atom-build-npm-apm](https://atom.io/packages/build-npm-apm) - Lets you invoke all npm scripts straight from the editor by pressing F7 (requires [atom-build](https://atom.io/packages/build))
* [linter](https://atom.io/packages/linter) and [linter-tslint](https://atom.io/packages/linter-tslint) - Shows linter errors and warning in the editor
