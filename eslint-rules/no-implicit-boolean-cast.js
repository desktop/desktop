module.exports = {
  meta: {
    docs: {
      description: 'Do not implicitly cast values to a boolean',
      category: 'Best Practices',
    },
  },
  create(context) {
    const sc = context.getSourceCode();

    function getIdentifier(node) {
      switch (node.type) {
        case 'Identifier':
        case 'ThisExpression':
        case 'SuperExpression':
          return node
        // See https://github.com/eslint/typescript-eslint-parser/pull/94 for progress on this
        // case 'MemberExpression':
        //   return getIdentifier(node.object)
        // case 'CallExpression':
        // case 'NewExpression':
        //   return getIdentifier(node.callee)
      }
      return null
    }
    return {
      IfStatement(node) {
        let { test } = node;

        if (test.type === "UnaryExpression" && test.operator === "!") {
          test = test.argument;
        }

        if (test.type === 'BinaryExpression') return;

        const id = getIdentifier(test)
        if (!id) return
        
        const variable = context.getScope().set.get(id.name)
        if (!variable) return

        const annotation = variable.defs[0].name.typeAnnotation
        if (!annotation || annotation.type !== 'BooleanTypeAnnotation') {
          let suffix = ''
          if (annotation) suffix = `, it’s of type \`${sc.getText(annotation.typeAnnotation)}\``
          context.report({
            node: test,
            message: `\`${id.name}\` is not a boolean${suffix}.`
          })
        }
      }
    };
  },
}
