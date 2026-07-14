# Custom ESLint rules for GitHub Desktop

This document outlines the rules we have added to the GitHub Desktop project and how to interact with them.

## About

This project uses rules from a number of sources, but sometimes we need specific rules that aren't available elsewhere. These are added to the `eslint-rules/` directory and are configured in the `.eslintrc.yml` file at the root of the project.

## Adding rules

If you wish to add a new rule specific to the project, ensure that there isn't an existing rule available from one of the existing plugins used in the project:

 - `@typescript-eslint/eslint-plugin`
 - `eslint-plugin-babel`
 - `eslint-plugin-jsdoc`
 - `eslint-plugin-json`
 - `eslint-plugin-prettier`
 - `eslint-plugin-react`
 
This project supports two different kinds of ESLint plugins, based on what you are interested in linting:

 - Typescript-aware rules, that allow you to inspect the AST and relevant information of the source files - these leverage the `@typescript-eslint` parser
    - example: `react-proper-lifecycle-methods` rule
 - Regular ESLint rules, that do not need to inspect the type information in the source files
    - example: `no-unbound-dispatcher-props` rule

How to write a plugin is out of scope for this documentation, but I've added some resources at the end of this page to help you get started.

## Checking locally

The custom ESLint rules are annotated with TypeScript types wherever available, and can be checked through `yarn`:

```
$ yarn check:eslint
```

The `eslint-rules/tsconfig.json` is setup to guide `tsc` to understand the environment for running the ESlint rules, and each rule is annotated
with `@type` hints wherever possible to appease the typechecker.

## Testing locally

Tests are added alongside each rule in the `eslint-rules/tests/` section, and can be run from the project root through `yarn`:

```
$ yarn test:eslint
```

Each test suite is designed to exercise the relevant rule against code snippets that illustrate both valid and invalid code, and indicate which messages should be reported in case of failure.

If you wish to debug the rules using VSCode, add this action to the `configurations` array of the `.vscode/launch.json` settings:


```json
{
  "command": "yarn test:eslint",
  "name": "Test ESLint scripts",
  "request": "launch",
  "type": "node-terminal"
}
```

Running this command will attach the debugger, and allow you to step through the rule with the available test cases.

## Additional resources

 - [ESLint - Working with Rules](http://eslint.org/docs/developer-guide/working-with-rules)
 - [`typescript-estree` package](https://github.com/typescript-eslint/typescript-eslint/tree/master/packages/typescript-estree) - this is part of `@typescript-eslint` and allows for interop between Typescript code and the `estree` reference spec that ESLint uses for it's plugins.
