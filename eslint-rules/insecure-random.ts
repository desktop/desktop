import { createRule } from './util'
import { AST_NODE_TYPES } from '@typescript-eslint/typescript-estree'

export = createRule({
  meta: {
    docs: {
      description: 'Do not use insecure sources for random bytes',
      category: 'Security',
    },
    type: 'problem',
    // strings from https://github.com/Microsoft/tslint-microsoft-contrib/blob/b720cd9/src/insecureRandomRule.ts
    messages: {
      math:
        'Math.random produces insecure random numbers. ' +
        'Use crypto.randomBytes() or window.crypto.getRandomValues() instead',
      node:
        'crypto.pseudoRandomBytes produces insecure random numbers. ' +
        'Use crypto.randomBytes() instead',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node
        if (
          callee.type === AST_NODE_TYPES.Identifier &&
          callee.name === 'pseudoRandomBytes'
        ) {
          context.report({ node, messageId: 'node' })
          return
        }
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          !callee.computed &&
          callee.property.type === AST_NODE_TYPES.Identifier
        ) {
          if (
            callee.object.type === 'Identifier' &&
            callee.object.name === 'Math' &&
            callee.property.name === 'random'
          ) {
            context.report({ node, messageId: 'math' })
          }
          if (callee.property.name === 'pseudoRandomBytes') {
            context.report({ node, messageId: 'node' })
          }
        }
      },
    }
  },
})
