// @ts-check

import { it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { TSESLint } from '@typescript-eslint/utils'
import plugin from '@typescript-eslint/eslint-plugin'

it('preserves empty-interface checks without banning empty object types', () => {
  const ruleTester = new TSESLint.RuleTester({
    parser: fileURLToPath(import.meta.resolve('@typescript-eslint/parser')),
  })

  const options = [{ allowInterfaces: 'never', allowObjectTypes: 'always' }]
  ruleTester.run(
    '@typescript-eslint/no-empty-object-type',
    plugin.rules['no-empty-object-type'],
    {
      valid: [
        'export type Empty = {}',
        'export interface IProps { readonly value: string }',
        `export interface IFirst { readonly first: string }
         export interface ISecond { readonly second: string }
         export interface ICombined extends IFirst, ISecond {}`,
      ].map(code => ({ code, options })),
      invalid: [
        {
          code: 'export interface IEmpty {}',
          options,
          errors: [{ messageId: 'noEmptyInterface' }],
        },
        {
          code: `export interface IBase { readonly value: string }
                 export interface IEmpty extends IBase {}`,
          options,
          errors: [{ messageId: 'noEmptyInterfaceWithSuper' }],
        },
      ],
    }
  )
})
