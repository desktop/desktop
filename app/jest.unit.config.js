module.exports = {
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testMatch: ['**/unit/**/*-test.ts{,x}'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFiles: ['<rootDir>/test/globals.ts', '<rootDir>/test/unit-test-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup-test-framework.ts'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!**/node_modules/**',
    '!**/vendor/**',
    '!**/*.d.*',
    // not focused on testing these areas currently
    '!src/ask-pass/**/*',
    '!src/cli/**/*',
    '!src/crash/**/*',
    '!src/highlighter/**/*',
    // ignore index files
    '!**/index.ts',
  ],
  reporters: ['default', '<rootDir>../script/jest-actions-reporter.js'],
  coverageReporters: ['text-summary', 'json', 'html', 'cobertura'],
  globals: {
    'ts-jest': {
      useBabelrc: true,
    },
  },
}
