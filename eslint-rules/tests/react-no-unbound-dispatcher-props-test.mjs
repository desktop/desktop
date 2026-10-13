// @ts-check
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { TSESLint } from '@typescript-eslint/utils'
const RuleTester = TSESLint.RuleTester
import rule from '../react-no-unbound-dispatcher-props.js'

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
  it('should complain about unbound dispatcher props', () => {
    const ruleTester = new RuleTester({
      parser: fileURLToPath(import.meta.resolve('@typescript-eslint/parser')),
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
