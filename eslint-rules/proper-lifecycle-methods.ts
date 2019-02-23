/**
 * react-proper-lifecycle-methods
 *
 * This custom ESLint rule is attempts to prevent erroneous usage of the React
 * lifecycle methods by ensuring proper method naming, and parameter order,
 * types and names.
 *
 */

import { createRule } from './util'
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/typescript-estree'

interface IExpectedParameter {
  readonly name: string
  readonly type: string
}

export = createRule({
  meta: {
    docs: {
      description: 'Enforce the ordering of buttons in <ButtonGroup />',
      category: 'Best Practices',
    },
    type: 'suggestion',
    messages: {
      noParams: '{{ method }} should not accept any parameters',
      extraParameter: 'Unknown parameter {{ name }}',
      badLifecycle:
        'Method names starting with component or shouldComponent ' +
        'are prohibited since they can be confused with React lifecycle methods.',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode()

    function isReactImport(
      identifier: TSESTree.Identifier,
      type: AST_NODE_TYPES
    ) {
      const objectRef = context
        .getScope()
        .variableScope.references.find(ref => ref.identifier === identifier)
      if (objectRef && objectRef.resolved) {
        const def = objectRef.resolved.defs[0]
        const parent: TSESTree.ImportDeclaration = def.node.parent
        if (
          def.type === 'ImportBinding' &&
          parent.source.type === AST_NODE_TYPES.Literal &&
          parent.source.value === 'react'
        ) {
          return def.node.type === type
        }
      }
      return false
    }

    function checkParameters(
      prop: TSESTree.MethodDefinition,
      expectedParameters: ReadonlyArray<IExpectedParameter>
    ) {
      for (let i = 0; i < prop.value.params.length; i++) {
        const param = prop.value.params[i]
        if (i > expectedParameters.length) {
          context.report({
            node: param,
            messageId: 'extraParameter',
            data: { name: sourceCode.getText(param) },
          })
        }

        // this is where I stopped
      }
    }

    return {
      'ClassDeclaration, ClassExpression'(
        node: TSESTree.ClassDeclaration | TSESTree.ClassExpression
      ) {
        const { superClass } = node
        if (!superClass) {
          return
        }
        if (
          superClass.type === AST_NODE_TYPES.MemberExpression &&
          (superClass.object.type !== AST_NODE_TYPES.Identifier ||
            superClass.property.type !== AST_NODE_TYPES.Identifier ||
            superClass.computed ||
            superClass.property.name !== 'Component' ||
            !(
              isReactImport(
                superClass.object,
                AST_NODE_TYPES.ImportNamespaceSpecifier
              ) ||
              isReactImport(
                superClass.object,
                AST_NODE_TYPES.ImportDefaultSpecifier
              )
            ))
        ) {
          return
        }
        if (
          superClass.type === AST_NODE_TYPES.Identifier &&
          (superClass.name !== 'Component' ||
            !isReactImport(superClass, AST_NODE_TYPES.ImportSpecifier))
        ) {
          return
        }

        for (const prop of node.body.body) {
          if (
            prop.type === AST_NODE_TYPES.MethodDefinition &&
            !prop.computed &&
            prop.key.type === AST_NODE_TYPES.Identifier &&
            (prop.key.name.startsWith('component') ||
              prop.key.name.startsWith('shouldComponent'))
          ) {
            switch (prop.key.name) {
              case 'componentWillMount':
              case 'componentDidMount':
              case 'componentWillUnmount':
                if (prop.value.params.length > 0) {
                  context.report({
                    node: prop.key,
                    messageId: 'noParams',
                    data: {
                      method: prop.key.name,
                    },
                  })
                }
                break
              case 'componentWillReceiveProps':
                return checkParameters(prop, [
                  { name: 'nextProps', type: propsTypeName },
                ])
              case 'componentWillUpdate':
                return checkParameters(prop, [
                  { name: 'nextProps', type: propsTypeName },
                  { name: 'nextState', type: stateTypeName },
                ])
              case 'componentDidUpdate':
                return checkParameters(prop, [
                  { name: 'prevProps', type: propsTypeName },
                  { name: 'prevState', type: stateTypeName },
                ])
              case 'shouldComponentUpdate':
                return checkParameters(prop, [
                  { name: 'nextProps', type: propsTypeName },
                  { name: 'nextState', type: stateTypeName },
                ])
              default:
                return context.report({
                  node: prop.key,
                  messageId: 'badLifecycle',
                })
            }
          }
        }
      },
    }
  },
})
