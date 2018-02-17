const ruleComposer = require('eslint-rule-composer')
const eslint = require('eslint')
const noUndefRule = new eslint.Linter().getRules().get('no-undef')

/**
 * @param  {object} node
 * @param  {string|string[]} types
 * @return {false|object}
 */
function hasParent(node, types) {
  if (!Array.isArray(types)) {
    types = [types]
  }
  if (node.parent == null) {
    return false
  }
  if (types.includes(node.parent.type)) {
    return node.parent
  }

  return hasParent(node.parent, types)
}

function getScope(scopeManager, node) {
  if (node == null) {
    return null
  }

  const _getScope = node =>
    scopeManager.acquireAll(node) || _getScope(node.parent)

  const scopes = _getScope(node)
  if (scopes == null || scopes.length === 0) {
    return null
  }

  return scopes.filter(
    scope => !scope.childScopes.find(child => scopes.includes(child))
  )[0]
}

function getReference(scopeManager, node) {
  const scope = getScope(scopeManager, node)
  if (scope == null) {
    return null
  }

  const _resolve = scope =>
    scope ? scope.resolve(node) || _resolve(scope.upper) : null

  return _resolve(scope)
}

/**
 * Find a definition of a variable created via a TS construct
 */
function findDefinition(scope, name) {
  if (!scope) {
    return null
  }

  let body = null
  const { block } = scope
  switch (block.type) {
    case 'Program':
    case 'BlockStatement':
      body = block.body
      break

    case 'SwitchStatement':
      body = block.cases.reduce(
        (res, { consequent }) => res.concat(consequent),
        []
      )
      break

    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ClassDeclaration':
    case 'CatchClause':
      body = block.body.body

    case 'ForOfStatement':
    case 'ArrowFunctionExpression':
      if (block.body.type === 'BlockStatement') {
        body = block.body.body
      } else {
        body = [block.body]
      }
      break
  }
  if (!body) {
    console.error('ERR! node', block, 'has no body')
    process.exit(1)
    return null
  }
  if (typeof body.find !== 'function') {
    console.log(scope.block)
    process.exit()
  }

  return (
    body
      .map(node => {
        switch (node.type) {
          case 'ExportDefaultDeclaration':
          case 'ExportNamedDeclaration':
            return node.declaration
          default:
            return node
        }
      })
      .find(node => {
        switch (node.type) {
          case 'TSEnumDeclaration':
            return node.id.name === name
          case 'TSImportEqualsDeclaration':
            return node.name.name === name
          default:
            return false
        }
      }) || findDefinition(scope.upper, name)
  )
}

module.exports = ruleComposer.filterReports(
  noUndefRule,
  (problem, { sourceCode }) => {
    const { node } = problem
    const { parent } = node
    const { scopeManager } = sourceCode

    if (
      hasParent(node, [
        'TSInterfaceDeclaration',
        'TSAbstractClassDeclaration',
        'TSEnumDeclaration',
        'TypeAnnotation',
        'TSTypeAnnotation',
        'TSImportEqualsDeclaration',
        'DeclareFunction',
        'TSNamespaceFunctionDeclaration',
      ])
    ) {
      return false
    }

    const module = hasParent(node, 'TSModuleDeclaration')
    if (module && module.declare) {
      return false
    }

    const variable = hasParent(node, 'VariableDeclaration')
    if (variable && variable.kind === 'type') {
      return false
    }

    if (parent.type === 'ClassProperty' && parent.key === node) {
      return false
    }

    const ref = getReference(scopeManager, node)
    if (ref.resolved == null) {
      // escope couldn’t find the definition
      if (findDefinition(ref.from, node.name)) {
        return false
      }
    }

    return true
  }
)
