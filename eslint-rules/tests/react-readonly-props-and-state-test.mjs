// @ts-check

import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { TSESLint } from '@typescript-eslint/utils'

const RuleTester = TSESLint.RuleTester
import rule from '../react-readonly-props-and-state.js'

// ------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------

const ruleTester = new RuleTester({
  parser: fileURLToPath(import.meta.resolve('@typescript-eslint/parser')),
})
describe('react-readonly-props-and-state', () => {
  it("should complain about props and state that aren't readonly", () => {
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
  })
})
