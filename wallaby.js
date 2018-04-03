module.exports = function (wallaby) {
  return {
    files: ['app/src/**/*.ts', 'app/src/**/*.tsx'],
    tests: ['app/test/**/*test.ts', 'app/test/**/*test.tsx'],

    compilers: {
      '**/*.ts': wallaby.compilers.typeScript({}),
      '**/*.tsx': wallaby.compilers.typeScript({}),
    },

    env: {
      kind: 'electron',
    },

    testFramework: 'mocha',
  }
}
