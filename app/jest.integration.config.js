module.exports = {
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testMatch: ['**/integration/**/*-test.ts{,x}'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupTestFrameworkScriptFile: '<rootDir>/test/setup-test-framework.ts',
  reporters: ['default', 'jest-junit'],
  globals: {
    'ts-jest': {
      useBabelrc: true,
    },
  },
}
