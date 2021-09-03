// @ts-check

const { ESLintUtils } = require('@typescript-eslint/experimental-utils')

const RuleTester = ESLintUtils.RuleTester
const rule = require('../set-almost-immediate')

// ------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------

const ruleTester = new RuleTester({
  parser: '@typescript-eslint/parser',
})
ruleTester.run('set-almost-immediate', rule, {
  valid: [
    {
      filename: 'app/src/ui/diff/helper.ts',
      code: `
const ref: AlmostImmediate = setAlmostImmediate(() => {})
clearAlmostImmediate(ref)
`,
    },
    {
      filename: 'app/src/ui/some-class.ts',
      code: `
class SomeClass {
  private ref: AlmostImmediate
}
`,
    },
  ],
  invalid: [
    {
      filename: 'app/src/ui/helper.ts',
      code: `
const ref: NodeJS.Immediate = setImmediate(() => {})
clearImmediate(ref)
`,
      errors: [
        {
          messageId: 'nodeJSImmediateForbidden',
        },
        {
          messageId: 'setImmediateForbidden',
        },
        {
          messageId: 'clearImmediateForbidden',
        },
      ],
      output: `
const ref: AlmostImmediate = setAlmostImmediate(() => {})
clearAlmostImmediate(ref)
`,
    },
    {
      filename: 'app/src/ui/some-class.ts',
      code: `
class SomeClass {
  private ref: NodeJS.Immediate
  private nullableRef: NodeJS.Immediate | null
}
`,
      errors: [
        {
          messageId: 'nodeJSImmediateForbidden',
        },
        {
          messageId: 'nodeJSImmediateForbidden',
        },
      ],
      output: `
class SomeClass {
  private ref: AlmostImmediate
  private nullableRef: AlmostImmediate | null
}
`,
    },
  ],
})
