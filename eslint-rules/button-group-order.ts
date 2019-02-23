/**
 * button-group-order
 *
 * This custom tslint rule is highly specific to GitHub Desktop and attempts
 * to enforce a consistent order for buttons inside of a <ButtonGroup>
 * component.
 *
 * Example
 *
 * <ButtonGroup>
 *  <Button>Cancel</Button>
 *  <Button type='submit'>Ok</Button>
 * </ButtonGroup>
 *
 * The example above will trigger a tslint error since we want to enforce
 * a consistent order of Ok/Cancel-style buttons (the button captions vary)
 * such that the primary action precedes any secondary actions.
 *
 * See https://www.nngroup.com/articles/ok-cancel-or-cancel-ok/
 *
 * We've opted for using the Windows order of OK, Cancel in our codebase, the
 * actual order at runtime will vary depending on platform.
 *
 */

import { createRule } from './util'
import { AST_NODE_TYPES } from '@typescript-eslint/typescript-estree'

export = createRule({
  meta: {
    docs: {
      description: 'Enforce the ordering of buttons in <ButtonGroup />',
      category: 'Best Practices',
    },
    type: 'suggestion',
    messages: {
      text: 'Unexpected raw text in button group',
      element: 'Unexpected non-button element `{{ name }}` in button group',
      order: 'Primary button should be the first in the group',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode()
    return {
      JSXElement(node) {
        if (
          node.openingElement.name.type !== AST_NODE_TYPES.JSXIdentifier ||
          node.openingElement.name.name !== 'ButtonGroup'
        ) {
          return
        }

        let hasFoundButton = false
        for (const child of node.children) {
          // Whitespace is okay.
          if (
            child.type === AST_NODE_TYPES.JSXText &&
            !/^\s*$/.test(child.value)
          ) {
            context.report({
              node: child,
              messageId: 'text',
            })
            continue
          }

          if (child.type === AST_NODE_TYPES.JSXElement) {
            const button = child.openingElement
            if (
              button.name.type === AST_NODE_TYPES.JSXIdentifier &&
              button.name.name === 'Button'
            ) {
              const typeAttribute = button.attributes.find(
                a => a.name.name === 'type'
              )

              const type =
                typeAttribute &&
                typeAttribute.value &&
                typeAttribute.value.type === AST_NODE_TYPES.Literal
                  ? String(typeAttribute.value.value)
                  : null

              if (hasFoundButton && type === 'submit') {
                context.report({
                  node: button,
                  messageId: 'order',
                })
              }

              hasFoundButton = true
            } else {
              context.report({
                node: child,
                messageId: 'element',
                data: {
                  name: sourceCode.getText(name),
                },
              })
            }
          }
        }
      },
    }
  },
})
