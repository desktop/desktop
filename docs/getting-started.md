# Getting started

## Prerequisites

### Node.js

We use some ES6+ language constructs in our build scripts sou need [Node.js](https://nodejs.org) 6+ (just pick whatever the 'current' release is at the moment). Node 6 comes with npm 3 out of the box and while npm 3 isn't strictly necessary to build it does make things more efficient, especially on Windows where deep folder hierarchies can be detrimental to build speed.

*Windows only: Make sure you allow the Node.js installer to add node to the PATH, it'll make life much easier for you*

### node-gyp

node-gyp is required to build some of our native npm packages (such as keytar)

* Install python 2.7 ([Windows](https://www.python.org/downloads/windows/), [MacOS](https://www.python.org/downloads/mac-osx/))
* **MacOS:** Xcode and Xcode Command Line Tools (Xcode -> Preferences -> Downloads)
* **Windows:** Visual Studio 2015 or [Visual C++ Build Tools](http://go.microsoft.com/fwlink/?LinkId=691126)
* `npm install -g node-gyp`

*Windows only*: Let python install into the default suggested path (`c:\Python27`), don't try to move it into Program Files.

## Windows prerequisites

* 

## Building

* Run `npm install` to get all required dependencies on your machine.
* 

## Using Atom?

If you're using [Atom](https://atom.io/) there's some plugins that you might want to install

* [atom-typescript](https://atom.io/packages/atom-typescript) - Syntax highlighting and intellisense for TypeScript
* [atom-build-npm-apm](https://atom.io/packages/build-npm-apm) - Lets you invoke all npm scripts straight from the editor by pressing F7 (requires [atom-build](https://atom.io/packages/build))
