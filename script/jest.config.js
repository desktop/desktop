module.exports = {
  roots: ['<rootDir>/changelog/', '<rootDir>/draft-release/'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testMatch: ['**/*-test.ts'],
  moduleFileExtensions: ['ts', 'js', 'jsx', 'json', 'node'],
  reporters: ['default', '<rootDir>/jest-actions-reporter.js'],
}
