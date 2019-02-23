/**
 * readonly-props-and-state
 *
 * This custom ESLint rule is highly specific to GitHub Desktop and attempts
 * to prevent props and state interfaces from being declared with mutable
 * members.
 *
 * While it's technically possible to modify this.props there's never a good
 * reason to do so and marking our interfaces as read only ensures that we
 * get compiler support for that fact.
 */

import { createRule } from './util'
import { AST_NODE_TYPES } from '@typescript-eslint/typescript-estree'

export = createRule({
  meta: {
    docs: {
      description: 'Ensure that props and state are declared as read-only',
      category: 'Best Practices',
    },
    fixable: 'code',
    type: 'suggestion',
    messages: {
      writable: 'Unexpected non-readonly {{ type }} key {{ key }}',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode()
    return {
      TSInterfaceDeclaration(node) {
        if (
          !node.id.name.endsWith('Props') &&
          !node.id.name.endsWith('State')
        ) {
          return
        }
        for (const member of node.body.body) {
          if (
            member.type === AST_NODE_TYPES.TSPropertySignature &&
            !member.readonly
          ) {
            context.report({
              node: member.key,
              messageId: 'writable',
              data: {
                type: node.id.name.endsWith('Props') ? 'props' : 'state',
                key: sourceCode.getText(member.key),
              },
              fix: fixer => fixer.insertTextBefore(member, 'readonly '),
            })
          }
        }
      },
    }
  },
})
