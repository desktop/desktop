// @ts-check

/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

function isLooselyTypesWebContentsCall(context, node) {
  const { callee } = node

  if (!['MemberExpression', 'OptionalMemberExpression'].includes(callee.type)) {
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
    (obj.type === 'MemberExpression' ||
      obj.type === 'OptionalMemberExpression') &&
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
  meta: {
    docs: {
      description: 'Do not use loosely typed webContents methods',
      category: 'Best Practices',
    },
    // strings from https://github.com/Microsoft/tslint-microsoft-contrib/blob/b720cd9/src/insecureRandomRule.ts
    messages: {
      useStronglyTypedWebContentsIPC:
        'Please use the strongly typed IPC helper methods from `ipc-webcontents` instead',
    },
  },
  create(context) {
    return {
      OptionalCallExpression: n => isLooselyTypesWebContentsCall(context, n),
      CallExpression: n => isLooselyTypesWebContentsCall(context, n),
    }
  },
}
