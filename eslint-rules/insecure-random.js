// strings from https://github.com/Microsoft/tslint-microsoft-contrib/blob/b720cd9/src/insecureRandomRule.ts
const MATH_FAIL_STRING =
  'Math.random produces insecure random numbers. ' +
  'Use crypto.randomBytes() or window.crypto.getRandomValues() instead'

const NODE_FAIL_STRING =
  'crypto.pseudoRandomBytes produces insecure random numbers. ' +
  'Use crypto.randomBytes() instead'

module.exports = {
  meta: {
    docs: {
      description: 'Do not use insecure sources for random bytes',
      category: 'Best Practices',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node
        const isMemberExpression = callee.type === 'MemberExpression'
        if (
          isMemberExpression &&
          callee.object.name === 'Math' &&
          callee.property.name === 'random'
        ) {
          context.report(node, MATH_FAIL_STRING)
        }
        if (
          (isMemberExpression &&
            callee.property.name === 'pseudoRandomBytes') ||
          callee.name === 'pseudoRandomBytes'
        ) {
          context.report(node, NODE_FAIL_STRING)
        }
      },
    }
  },
}
