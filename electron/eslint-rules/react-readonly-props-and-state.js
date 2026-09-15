// @ts-check

/**
 * react-readonly-props-and-state
 *
 * This custom eslint rule is highly specific to GitHub Desktop and attempts
 * to prevent props and state interfaces from being declared with mutable
 * members.
 *
 * While it's technically possible to modify this.props there's never a good
 * reason to do so and marking our interfaces as read only ensures that we
 * get compiler support for that fact.
 */

/**
 * @typedef {import('@typescript-eslint/experimental-utils').TSESLint.RuleModule} RuleModule
 * @typedef {import("@typescript-eslint/typescript-estree").TSESTree.TSInterfaceBody} TSInterfaceBody
 */

/** @type {RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    messages: {
      signaturesShouldBeReadonly: `Property and state signatures should be read-only`,
      arraySignaturesShouldBeReadonly: `Prop and State arrays should be read only (ReadOnlyArray)`,
    },
    fixable: 'code',
    schema: [],
  },
  create: function (context) {
    const filename = context.getFilename()
    if (filename.toLowerCase().endsWith('ts')) {
      return {}
    }

    const sourceCode = context.getSourceCode()

    /**
     * Check each member of the interface body and ensure it is marked `readonly`.
     *
     * @param {TSInterfaceBody} body
     */
    function ensureReadOnly(body) {
      body.body.forEach(member => {
        if (member.type !== 'TSPropertySignature') {
          return
        }

        const isReadOnly = member.readonly || false

        if (!isReadOnly) {
          context.report({
            node: member,
            messageId: 'signaturesShouldBeReadonly',
          })
        }

        if (member.typeAnnotation) {
          const typeString = sourceCode.getText(member.typeAnnotation)
          if (
            /^\: \s*Array<.*>$/.test(typeString) ||
            typeString.endsWith('[]')
          ) {
            context.report({
              node: member,
              messageId: 'arraySignaturesShouldBeReadonly',
            })
          }
        }
      })
    }

    return {
      TSInterfaceDeclaration(node) {
        if (node.id.name.endsWith('Props')) {
          ensureReadOnly(node.body)
        }
        if (node.id.name.endsWith('State')) {
          ensureReadOnly(node.body)
        }
      },
    }
  },
}
