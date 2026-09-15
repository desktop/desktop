// @ts-check

/**
 * @typedef {import('@typescript-eslint/utils').TSESLint.RuleModule<'useStronglyTypedWebContentsIPC', []>} RuleModule
 */

/**
 * @param {import('@typescript-eslint/utils').TSESLint.RuleContext<'useStronglyTypedWebContentsIPC', []>} context
 * @param {import('@typescript-eslint/utils').TSESTree.CallExpression} node
 */
function isLooselyTypesWebContentsCall(context, node) {
  const { callee } = node

  if (callee.type !== 'MemberExpression') {
    return
  }

  const prop = callee.property

  if (prop.type !== 'Identifier' || prop.name !== 'send') {
    return
  }

  // wc.send() but not foo.wc.send
  if (callee.object.type === 'Identifier' && callee.object.name === 'wc') {
    context.report({ node, messageId: 'useStronglyTypedWebContentsIPC' })
    return
  }

  const obj = callee.object

  // *.webContents?.send
  if (
    obj.type === 'MemberExpression' &&
    obj.property.type === 'Identifier' &&
    obj.property.name === 'webContents'
  ) {
    context.report({ node, messageId: 'useStronglyTypedWebContentsIPC' })
  }

  // webContents.send
  if (obj.type === 'Identifier' && obj.name === 'webContents') {
    context.report({ node, messageId: 'useStronglyTypedWebContentsIPC' })
  }
}

/** @type {RuleModule} */
module.exports = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    schema: [],
    docs: {
      description: 'Do not use loosely typed webContents methods',
    },
    // strings from https://github.com/Microsoft/tslint-microsoft-contrib/blob/b720cd9/src/insecureRandomRule.ts
    messages: {
      useStronglyTypedWebContentsIPC:
        'Please use the strongly typed IPC helper methods from `ipc-webcontents` instead',
    },
  },
  create(context) {
    return {
      CallExpression: n => isLooselyTypesWebContentsCall(context, n),
    }
  },
}
