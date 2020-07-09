module.exports = {
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  testMatch: ['**/unit/**/*-test.ts{,x}'],
  moduleFileExtensions: ['js', 'json', 'jsx', 'node', 'ts', 'tsx'],
  setupFiles: ['<rootDir>/test/globals.ts', '<rootDir>/test/unit-test-env.ts'],
  setupTestFrameworkScriptFile: '<rootDir>/test/setup-test-framework.ts',
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!**/node_modules/**',
    '!**/vendor/**',
    '!**/*.d.*',
    '!src/ask-pass/**/*',
    '!src/cli/**/*',
    '!src/crash/**/*',
    '!src/highlighter/**/*',
    '!**/index.ts',
  ],
  reporters: ['default', '<rootDir>../script/jest-actions-reporter.js'],
  coverageReporters: ['text-summary', 'json', 'html', 'cobertura'],
  globals: {
    'ts-jest': {
      babelConfig: true,
    },
  },
  preset: 'ts-jest',
}
