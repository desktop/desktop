module.exports = {
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '\\.m?jsx?$': '<rootDir>/test/esm-transformer.js',
  },
  resolver: `<rootDir>/test/resolver.js`,
  testMatch: ['**/unit/**/*-test.ts{,x}'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFiles: ['<rootDir>/test/globals.ts', '<rootDir>/test/unit-test-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup-test-framework.ts'],
  reporters: ['default', '<rootDir>../script/jest-actions-reporter.js'],
  // For now, @github Node modules required to be transformed by jest-esm-transformer
  transformIgnorePatterns: ['node_modules/(?!(@github))'],
  testEnvironment: 'jsdom',
}
