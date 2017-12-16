module.exports = {
  meta: {
    fixable: 'code',
    docs: {
      description: 'Do not implicitly cast values to a boolean',
      category: 'Best Practices',
    },
  },
  create(context) {
    const sc = context.getSourceCode()
    const services = context.parserServices

    function check(node) {
      if (node.type === 'UnaryExpression' && node.operator === '!') {
        check(node.argument)
        return
      } else if (node.type === 'LogicalExpression') {
        check(node.left)
        check(node.right)
        return
      }

      const type = context.parserServices.getType(node)

      if (type.intrinsicName !== 'boolean') {
        let suffix = ''
        if (type.intrinsicName !== 'unknown') {
          suffix = `, it’s of type \`${services.typeChecker.typeToString(
            type
          )}\``
        }

        context.report({
          node,
          message: `\`${sc.getText(node)}\` is not a boolean${suffix}.`,
          fix(fixer) {
            if (node.parent.type === 'UnaryExpression') {
              return fixer.replaceText(
                node.parent,
                `${sc.getText(node)} == null`
              )
            }
            return fixer.replaceText(node, `${sc.getText(node)} != null`)
          },
        })
      }
    }

    return {
      // wait until all the parents are resolved
      'IfStatement, TernaryExpression:exit'(node) {
        check(node.test)
      },
    }
  },
}
