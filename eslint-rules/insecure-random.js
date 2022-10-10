// @ts-check

/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/** @type {RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Do not use insecure sources for random bytes',
      category: 'Best Practices',
    },
    // strings from https://github.com/Microsoft/tslint-microsoft-contrib/blob/b720cd9/src/insecureRandomRule.ts
    messages: {
      mathRandomInsecure:
        'Math.random produces insecure random numbers. Use crypto.randomBytes() or window.crypto.getRandomValues() instead',
      pseudoRandomBytesInsecure:
        'crypto.pseudoRandomBytes produces insecure random numbers. Use crypto.randomBytes() instead',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node

        if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'Math' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'random'
        ) {
          context.report({ node, messageId: 'mathRandomInsecure' })
        }

        if (
          (callee.type === 'MemberExpression' &&
            callee.property.type === 'Identifier' &&
            callee.property.name === 'pseudoRandomBytes') ||
          (callee.type === 'Identifier' && callee.name === 'pseudoRandomBytes')
        ) {
          context.report({ node, messageId: 'pseudoRandomBytesInsecure' })
        }
      },
    }
  },
}
