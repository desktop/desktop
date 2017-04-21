# Tooling Support for GitHub Desktop

## [Atom](https://atom.io/)

Here are some plugins you should also install:

* [atom-typescript](https://atom.io/packages/atom-typescript) - Syntax highlighting and intellisense for TypeScript
* [atom-build-npm-apm](https://atom.io/packages/build-npm-apm) - Lets you invoke all npm scripts straight from the editor by pressing F7 (requires [atom-build](https://atom.io/packages/build))
* [linter](https://atom.io/packages/linter) and [linter-tslint](https://atom.io/packages/linter-tslint) - Shows linter errors and warning in the editor

## [Visual Studio Code](https://code.visualstudio.com/)

The Desktop repository includes a list of extensions that we recommend:

1. While in the _Extension_ view, select *Show Workspace Recommended Extensions* from the dropdown menu
2. Install all the extensions

We also support debugging the running app inside VSCode:

1. Run the command `npm run debug`
2. Select the _Debug_ view from the view bar
3. Select the process you would like to attach to (this will usually be the _Renderer_ process)
4. Press `F5` or the green play button

![2017-02-07_15-24-23](https://cloud.githubusercontent.com/assets/1715082/22712204/90ca44fa-ed49-11e6-9110-ffa9c1d4f752.jpg)




## Debugging

### Chrome

1. Run the command `npm run start`
2. Open _Chrome Dev Tools_

[React Dev Tools](https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi?hl=en) should automatically install itself on first start. If you would also like to use [Devtron](http://electron.atom.io/devtron/), run the command `require('devtron').install()` inside of the console in _Chrome Dev Tools_.

### VS Code

1. Run the command `npm run debug`
2. Select the _Debug_ view from the view bar
3. Select the process you would like to attach to (this will usually be the _Renderer_ process)
4. Press `F5` or the green play button

![2017-02-07_15-24-23](https://cloud.githubusercontent.com/assets/1715082/22712204/90ca44fa-ed49-11e6-9110-ffa9c1d4f752.jpg)


