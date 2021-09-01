// @ts-check

/**
 * set-almost-immediate
 *
 * This custom eslint rule is highly specific to GitHub Desktop and attempts
 * to prevent using setImmediate since, under some circumstances, could not work
 * at all in Electron 11.4.0+
 *
 * For more info about this issue, see: https://github.com/electron/electron/issues/29261
 *
 * As long as this issue persists, we'll use an alternative named setAlmostImmediate,
 * and this rule will ensure that's used instead of setImmediate.
 */

/**
 * @typedef {import('@typescript-eslint/experimental-utils').TSESLint.RuleModule} RuleModule
 * @typedef {import("@typescript-eslint/typescript-estree").TSESTree.TSTypeAnnotation} TSTypeAnnotation
 * @typedef {import("@typescript-eslint/typescript-estree").TSESTree.TypeNode} TypeNode
 */

/** @type {RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    messages: {
      setImmediateForbidden: `setImmediate cannot be used, use setAlmostImmediate instead`,
      clearImmediateForbidden: `clearImmediate cannot be used, use clearAlmostImmediate instead`,
      nodeJSImmediateForbidden: `NodeJS.Immediate cannot be used, use AlmostImmediate instead`,
    },
    fixable: 'code',
    schema: [],
  },
  create: function (context) {
    const sourceCode = context.getSourceCode()

    /**
     * Check if a type annotation contains any references to NodeJS.Immediate
     * and report them to be changed to AlmostImmediate.
     *
     * @param {TSTypeAnnotation} node
     * @param {TypeNode} typeAnnotation
     */
    function scanTypeAnnotation(node, typeAnnotation) {
      if (typeAnnotation.type === 'TSTypeReference') {
        const typeName = sourceCode.getText(typeAnnotation)
        if (typeName === 'NodeJS.Immediate') {
          context.report({
            loc: typeAnnotation.loc,
            messageId: 'nodeJSImmediateForbidden',
            fix: fixer => {
              return fixer.replaceTextRange(
                typeAnnotation.range,
                'AlmostImmediate'
              )
            },
          })
        }
      } else if ('types' in typeAnnotation) {
        for (const type of typeAnnotation.types) {
          scanTypeAnnotation(node, type)
        }
      }
    }

    return {
      TSTypeAnnotation(node) {
        scanTypeAnnotation(node, node.typeAnnotation)
      },
      CallExpression(node) {
        const { callee } = node

        if (callee.type !== 'Identifier') {
          return
        }

        const functionName = sourceCode.getText(callee)

        const offendingFunctions = {
          setImmediate: {
            messageId: 'setImmediateForbidden',
            replacement: 'setAlmostImmediate',
          },
          clearImmediate: {
            messageId: 'clearImmediateForbidden',
            replacement: 'clearAlmostImmediate',
          },
        }

        const offendingCall = offendingFunctions[functionName]
        if (offendingCall !== undefined) {
          context.report({
            node: callee,
            messageId: offendingCall.messageId,
            fix: fixer => {
              return fixer.replaceTextRange(
                node.callee.range,
                offendingCall.replacement
              )
            },
          })
        }
      },
    }
  },
}
