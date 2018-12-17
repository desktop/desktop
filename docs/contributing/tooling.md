# Tooling Support for GitHub Desktop

### [Atom](https://atom.io/)

Recommended packages:

* [atom-typescript](https://atom.io/packages/atom-typescript) - syntax
  highlighting and intellisense for TypeScript
* [build-npm-apm](https://atom.io/packages/build-npm-apm) - invoke
  all npm scripts straight from the editor by pressing F7 (requires
  [build](https://atom.io/packages/build))
* [linter](https://atom.io/packages/linter) and
  [linter-tslint](https://atom.io/packages/linter-tslint) - shows linter errors and warning in the editor

You can install them all at once with:

```shellsession
apm i atom-typescript build-npm build busy-signal linter-tslint linter linter-ui-default intentions
```
If atom prompts you to install any additional dependencies for these packages, be sure to say yes.

### [Visual Studio Code](https://code.visualstudio.com/)

The Desktop repository includes a list of recommended extensions:

1. Select the _Extension_ view, select *Show Workspace Recommended Extensions* from the dropdown menu
2. Install all the extensions

## Debugging

When running the app in development mode, the Chrome Dev Tools are also launched, to assist with debugging and poking at the live application.

```shellsession
$ yarn
$ yarn build:dev
$ yarn start
```

At a basic level, the logs from the running app are displayed in the **Console** tab, but other features include:

 - [React Dev Tools](https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi?hl=en) - enables you to inspect components and view rendering activity in real time
 - [Devtron](http://electron.atom.io/devtron/) - not enabled by default, but you can add this from the console: `require('devtron').install()`

If you are looking to diagnose React performance issues in Desktop, [this post by Ben Schwarz](https://building.calibreapp.com/debugging-react-performance-with-react-16-and-chrome-devtools-c90698a522ad)
is a great introduction to the workflow enabled by React 16 around measuring and investigating using the **Performance** tab.
