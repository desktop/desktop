module.exports = {
  roots: ['<rootDir>/app/src/', '<rootDir>/app/test/'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testMatch: ['**/unit/**/*-test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFiles: [
    '<rootDir>/app/test/globals.ts',
    '<rootDir>/app/test/unit-test-env.ts',
  ],
  setupTestFrameworkScriptFile: '<rootDir>/app/test/setup-test-framework.ts',
  collectCoverageFrom: [
    '**/*.{js,jsx,ts,tsx}',
    '!**/node_modules/**',
    '!**/vendor/**',
    '!**/*.d.*',
  ],
  globals: {
    'ts-jest': {
      useBabelrc: true,
    },
  },
}
