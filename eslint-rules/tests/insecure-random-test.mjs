// @ts-check
import { describe, it } from 'node:test'

import { RuleTester } from 'eslint'
import rule from '../insecure-random.js'

/** @type {import('eslint').Linter.ParserOptions} */
const parserOptions = {
  ecmaVersion: 2015,
  sourceType: 'module',
}

describe('insecure-random', () => {
  it('should complain about Math.random()', () => {
    const ruleTester = new RuleTester({ parserOptions })
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
