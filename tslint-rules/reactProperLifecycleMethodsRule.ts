/**
 * react-proper-lifecycle-methods
 *
 * This custom tslint rule is attemptsto prevent erroneous usage of the React
 * lifecycle methods by ensuring proper method naming, and parameter order,
 * types and names.
 *
 */

import * as ts from 'typescript'
import * as Lint from 'tslint/lib/lint'

interface IExpectedParameter {
  readonly name: string,
  readonly type: string
}

export class Rule extends Lint.Rules.AbstractRule {
    public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
      if (sourceFile.languageVariant === ts.LanguageVariant.JSX) {
        return this.applyWithWalker(new ReactProperLifecycleMethodsWalker(sourceFile, this.getOptions()))
      } else {
          return []
      }
    }
}

class ReactProperLifecycleMethodsWalker extends Lint.RuleWalker {

  private propsTypeName: string
  private stateTypeName: string

  protected visitClassDeclaration(node: ts.ClassDeclaration): void {
    if (node.heritageClauses && node.heritageClauses.length) {
      for (const heritageClause of node.heritageClauses) {
        if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword && heritageClause.types) {
          for (const type of heritageClause.types) {
            const inheritedName = type.expression.getText()

            if (inheritedName === 'React.Component') {
              if (type.typeArguments && type.typeArguments.length === 2) {
                this.propsTypeName = type.typeArguments[0].getText()
                this.stateTypeName = type.typeArguments[1].getText()

                super.visitClassDeclaration(node)
                return
              }
            }
          }
        }
      }
    }
  }

  protected visitMethodDeclaration(node: ts.MethodDeclaration): void {
    const methodName = node.name.getText()
    if (/^component|^shouldComponent/.test(methodName)) {
      switch (methodName) {
        case 'componentWillMount':
        case 'componentDidMount':
        case 'componentWillUnmount':
          this.verifyEmptyParameters(node)
          break
        case 'componentWillReceiveProps':
          this.verifyComponentWillReceiveProps(node)
          break
        case 'componentWillUpdate':
          this.verifyComponentWillUpdate(node)
          break
        case 'componentDidUpdate':
        case 'shouldComponentUpdate':
          return
      }
    }
  }

  private verifyEmptyParameters(node: ts.MethodDeclaration) {
    if (node.parameters.length) {
      const start = node.getStart()
      const width = node.getWidth()

      const methodName = node.name.getText()
      const message = `${methodName} should not accept any parameters.`

      this.addFailure(this.createFailure(start, width, message))
    }
  }

  private verifyParameter(node: ts.ParameterDeclaration, expectedParameter: IExpectedParameter): boolean {
    const parameterName = node.name.getText()

    const parameterStart = node.getStart()
    const parameterwidth = node.getWidth()

    if (parameterName !== expectedParameter.name) {
      const message = `parameter should be named ${expectedParameter.name}.`
      this.addFailure(this.createFailure(parameterStart, parameterwidth, message))
      return false
    }

    const parameterTypeName = node.type ? node.type.getText() : undefined

    if (parameterTypeName !== expectedParameter.type) {
      const message = `parameter should be of type ${expectedParameter.type}.`
      this.addFailure(this.createFailure(parameterStart, parameterwidth, message))
      return false
    }

    return true
  }

  private verifyParameters(node: ts.MethodDeclaration, expectedParameters: ReadonlyArray<IExpectedParameter>): boolean {
    if (node.parameters.length !== expectedParameters.length) {
      const start = node.getStart()
      const width = node.getWidth()
      const methodName = node.name.getText()
      const parameterText = expectedParameters
        .map(p => `${p.name}: ${p.type}`)
        .join(', ')

      const message = `${methodName} should take exactly ${expectedParameters.length} parameters: ${parameterText}`

      this.addFailure(this.createFailure(start, width, message))
      return false
    }

    for (let i = 0; i < expectedParameters.length; i++) {
      const actual = node.parameters[i]
      const expected = expectedParameters[i]

      if (this.verifyParameter(actual, expected)) {
        return false
      }
    }

    return true
  }

  private verifyComponentWillReceiveProps(node: ts.MethodDeclaration) {
    this.verifyParameters(node, [ { name: 'nextProps', type: this.propsTypeName } ])
  }

  private verifyComponentWillUpdate(node: ts.MethodDeclaration) {
    this.verifyParameters(node, [
      { name: 'nextProps', type: this.propsTypeName },
      { name: 'nextState', type: this.stateTypeName },
    ])
  }
}
