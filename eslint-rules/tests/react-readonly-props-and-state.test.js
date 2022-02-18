// @ts-check

const { ESLintUtils } = require('@typescript-eslint/experimental-utils')

const RuleTester = ESLintUtils.RuleTester
const rule = require('../react-readonly-props-and-state')

// ------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------

const ruleTester = new RuleTester({
  parser: '@typescript-eslint/parser',
})
ruleTester.run('react-readonly-props-and-state', rule, {
  valid: [
    {
      filename: 'app/src/ui/component.tsx',
      code: `
interface IBranchListItemProps {
  readonly name: string
}
`,
    },
    {
      filename: 'app/src/ui/component.tsx',
      code: `
interface IBranchListItemState {
  readonly name: string
}
`,
    },
    {
      filename: 'app/src/ui/component.tsx',
      code: `
interface ISomeOtherThing {
  name: string
}
`,
    },
    {
      filename: 'app/src/ui/component.tsx',
      code: `
interface ISomeState {
  readonly name: ReadonlyArray<string>
}
`,
    },
    {
      filename: 'app/src/ui/diff/helper.ts',
      code: `
  interface IState {
    diffLineIndex: number
    previousHunkOldEndLine: number | null
  }`,
    },
  ],
  invalid: [
    {
      filename: 'app/src/ui/component.tsx',
      code: `
interface IBranchListItemProps {
  name: string
}
      `,
      errors: [
        {
          messageId: 'signaturesShouldBeReadonly',
        },
      ],
    },
    {
      filename: 'app/src/ui/component.tsx',
      code: `
interface IBranchListItemProps {
  readonly items: Array<string>
}
      `,
      errors: [
        {
          messageId: 'arraySignaturesShouldBeReadonly',
        },
      ],
    },
    {
      filename: 'app/src/ui/component.tsx',
      code: `
interface IBranchListItemProps {
  readonly items: string[]
}
      `,
      errors: [
        {
          messageId: 'arraySignaturesShouldBeReadonly',
        },
      ],
    },
  ],
})
