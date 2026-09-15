const { describe, it } = require('node:test')
// @ts-check

const RuleTester = require('eslint').RuleTester
const rule = require('../react-no-unbound-dispatcher-props')

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
  it('should complain about unbound dispatcher props', () => {
    const ruleTester = new RuleTester({ parserOptions })
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
