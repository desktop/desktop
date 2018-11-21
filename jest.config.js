module.exports = {
  roots: ['<rootDir>/app/src/', '<rootDir>/app/test/'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testMatch: ['**/unit/**/*-test.ts{,x}'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFiles: [
    '<rootDir>/app/test/globals.ts',
    '<rootDir>/app/test/unit-test-env.ts',
  ],
  setupTestFrameworkScriptFile: '<rootDir>/app/test/setup-test-framework.ts',
  collectCoverageFrom: [
    'app/src/**/*.{js,jsx,ts,tsx}',
    '!**/node_modules/**',
    '!**/vendor/**',
    '!**/*.d.*',
    // not focused on testing these areas currently
    '!app/src/ask-pass/**/*',
    '!app/src/cli/**/*',
    '!app/src/crash/**/*',
    '!app/src/highlighter/**/*',
    // ignore index files
    '!**/index.ts',
  ],
  coverageReporters: ['text-summary', 'json', 'html', 'cobertura'],
  globals: {
    'ts-jest': {
      useBabelrc: true,
    },
  },
}
