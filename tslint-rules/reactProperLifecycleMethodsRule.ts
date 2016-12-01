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
        case 'shouldComponentUpdate':
        case 'componentWillUpdate':
        case 'componentDidUpdate':
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
}
