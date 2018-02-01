# Known Issues

Here's a non-exhaustive list of environmental issues that you may encounter
while working on GitHub Desktop:

### Issues compiling node-keytar on Windows

If keytar fails to build on Windows with the following error during `npm install`:

```
npm ERR! keytar@3.0.2 install: `node-gyp rebuild`
npm ERR! Exit status 1
npm ERR!
npm ERR! Failed at the keytar@3.0.2 install script 'node-gyp rebuild'.
npm ERR! Make sure you have the latest version of node.js and npm installed.
npm ERR! If you do, this is most likely a problem with the keytar package,
npm ERR! not with npm itself.
npm ERR! Tell the author that this fails on your system:
npm ERR!     node-gyp rebuild
npm ERR! You can get information on how to open an issue for this project with:
npm ERR!     npm bugs keytar
npm ERR! Or if that isn't available, you can get their info via:
npm ERR!     npm owner ls keytar
```

Make sure you're using npm >= 2.15.9

```
PS> npm -g install npm@latest
```

and run `npm install` again

For more information see
[atom/node-keytar#45](https://github.com/atom/node-keytar/issues/45) and
[nodejs/node-gyp#972](https://github.com/nodejs/node-gyp/issues/972).
