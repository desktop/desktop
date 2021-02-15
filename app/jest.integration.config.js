module.exports = {
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testMatch: ['**/integration/**/*-test.ts{,x}'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEnv: ['<rootDir>/test/setup-test-framework.ts'],
  reporters: ['default', '<rootDir>../script/jest-actions-reporter.js'],
  globals: {
    'ts-jest': {
      useBabelrc: true,
    },
  },
}
