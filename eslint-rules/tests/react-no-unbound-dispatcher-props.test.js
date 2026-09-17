// @ts-check

const { describe, it } = require('node:test')
const { TSESLint } = require('@typescript-eslint/utils')
const RuleTester = TSESLint.RuleTester
RuleTester.describe = describe
RuleTester.it = it
const rule = require('../react-no-unbound-dispatcher-props')

/** @type {import('@typescript-eslint/utils').TSESLint.ParserOptions} */
const parserOptions = {
  ecmaVersion: 2018,
  sourceType: 'module',
  ecmaFeatures: {
    jsx: true,
  },
}

// ------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------

describe('react-no-unbound-dispatcher-props', () => {
  describe('should complain about unbound dispatcher props', () => {
    const ruleTester = new RuleTester({
      parser: require.resolve('espree'),
      parserOptions,
    })
    ruleTester.run('react-no-unbound-dispatcher-props', rule, {
      valid: [
        '<Resizable onReset={() => { this.props.dispatcher.resetSidebarWidth }} />',
      ],
      invalid: [
        {
          code: '<Resizable onReset={this.props.dispatcher.resetSidebarWidth} />',
          errors: [
            {
              messageId: 'unboundMethod',
              data: {
                text: 'this.props.dispatcher.resetSidebarWidth',
              },
            },
          ],
        },
      ],
    })
  })
})
