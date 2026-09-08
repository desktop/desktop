// @ts-check

const { describe, it } = require('node:test')
const { TSESLint } = require('@typescript-eslint/utils')
const RuleTester = TSESLint.RuleTester
RuleTester.describe = describe
RuleTester.it = it
const rule = require('../insecure-random')

/** @type {import('@typescript-eslint/utils').TSESLint.ParserOptions} */
const parserOptions = {
  ecmaVersion: 2015,
  sourceType: 'module',
}

describe('insecure-random', () => {
  describe('should complain about Math.random()', () => {
    const ruleTester = new RuleTester({
      parser: require.resolve('espree'),
      parserOptions,
    })
    ruleTester.run('insecure-random', rule, {
      valid: [
        'const b = crypto.randomBytes();',
        'const b = window.crypto.getRandomValues();',
      ],
      invalid: [
        {
          code: 'const b = Math.random();',
          errors: [{ messageId: 'mathRandomInsecure' }],
        },
        {
          code: `
      const crypto = require('crypto');

      const b = crypto.pseudoRandomBytes();`,
          errors: [{ messageId: 'pseudoRandomBytesInsecure' }],
        },
        {
          code: `
      const { pseudoRandomBytes } = require('crypto');
      
      const b = pseudoRandomBytes();
      
      `,
          errors: [{ messageId: 'pseudoRandomBytesInsecure' }],
        },
      ],
    })
  })
})
