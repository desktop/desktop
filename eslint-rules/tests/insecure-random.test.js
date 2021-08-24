// @ts-check

const RuleTester = require('eslint').RuleTester
const rule = require('../insecure-random')

const parserOptions = {
  ecmaVersion: 2015,
  sourceType: 'module',
}

const ruleTester = new RuleTester({ parserOptions })
ruleTester.run('react-no-unbound-dispatcher-props', rule, {
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
