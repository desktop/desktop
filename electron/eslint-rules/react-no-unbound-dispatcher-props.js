// @ts-check

/**
 * react-no-unbound-dispatcher-props
 *
 * This custom eslint rule is highly specific to GitHub Desktop and attempts
 * to prevent errors caused by passing unbound dispatcher methods as callbacks
 * to components.
 *
 * Example
 *
 * <Resizable onReset={this.props.dispatcher.resetSidebarWidth} />
 *
 * The example above will fail at runtime because the resetSidebarWidth method
 * is invoked with the `this` context not set to the dispatcher instance. The
 * solution is to wrap the dispatcher callback in a bound instance method and
 * passing that to the component in question.
 *
 * private handleReset = () => { this.props.dispatcher.resetSidebarWidth }
 * ...
 * <Resizable onReset={this.handleReset} />
 */

/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/** @type {RuleModule} */
module.exports = {
  meta: {
    type: 'problem',

    docs: {
      description:
        'Identify any potential misuse of the dispatcher inside components',
    },
    messages: {
      unboundMethod:
        'Use of unbound dispatcher method: {{ text }}. Consider extracting the method call to a bound instance method.',
    },
    fixable: 'code',
    schema: [], // no options
  },
  create: function (context) {
    const sourceCode = context.getSourceCode()
    return {
      JSXExpressionContainer(node) {
        const text = sourceCode.getText(node)

        if (/^\{this\.props\.dispatcher\./.test(text)) {
          const textWithoutContainer = text.slice(1, text.length - 1)
          context.report({
            node: node,
            messageId: 'unboundMethod',
            data: {
              text: textWithoutContainer,
            },
          })
        }
      },
    }
  },
}
