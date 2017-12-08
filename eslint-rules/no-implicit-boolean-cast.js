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
        case 'MemberExpression':
          return getIdentifier(node.object)
        case 'CallExpression':
        case 'NewExpression':
          return getIdentifier(node.callee)
      }
      return node.type 
    }
    return {
      IfStatement(node) {
        let { test } = node;

        if (test.type === "UnaryExpression" && test.operator === "!") {
          test = test.argument;
        }

        if (test.type === 'BinaryExpression') return;

        const id = getIdentifier(test)
        const variable = context.getScope().set.get(id.name)
        if (variable) {
          const def = variable.defs[0].name.typeAnnotation.typeAnnotation
          if (def.type !== 'BooleanTypeAnnotation') {
            // var foo: [not] boolean
            context.report({
              node: test,
              message: 'This isn’t a boolean!'
            })
          }
        }
      }
    };
  },
}
