/**
 * react-no-unbound-dispatcher-props
 *
 * This custom tslint rule is highly specific to GitHub Desktop and attempts
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

import * as ts from 'typescript'
import * as Lint from 'tslint'

// The walker takes care of all the work.
class ReactNoUnboundDispatcherPropsWalker extends Lint.RuleWalker {
  protected visitJsxElement(node: ts.JsxElement): void {
    this.visitJsxOpeningLikeElement(node.openingElement)
    super.visitJsxElement(node)
  }

  protected visitJsxSelfClosingElement(node: ts.JsxSelfClosingElement): void {
    this.visitJsxOpeningLikeElement(node)
    super.visitJsxSelfClosingElement(node)
  }

  /**
   * Visit the node and apply the rule about ensuring the dispatcher is bound.
   *
   *  JsxOpeningLikeElement encompasses both self-closing and regular elements
   */
  private visitJsxOpeningLikeElement(node: ts.JsxOpeningLikeElement): void {
    // create violations if the listener is a reference to a class method that was not bound to 'this' in the constructor
    node.attributes.properties.forEach(attributeLikeElement => {
      if (attributeLikeElement.kind !== ts.SyntaxKind.JsxAttribute) {
        return
      }

      // This is some weak sauce, why doesn't JsxAttribute specify a literal kind
      // so that it can be narrowed automatically?
      const attribute: ts.JsxAttribute = attributeLikeElement

      // This means that the attribute is an inferred boolean true value. See:
      //
      // https://github.com/Microsoft/TypeScript/blob/52ec508/src/compiler/types.ts#L1483
      // https://facebook.github.io/react/docs/jsx-in-depth.html#props-default-to-true
      if (!attribute.initializer) {
        return
      }

      // This likely means that the attribute is a string literal
      // ie <foo className='foo' />
      if (attribute.initializer.kind !== ts.SyntaxKind.JsxExpression) {
        return
      }

      const jsxExpression: ts.JsxExpression = attribute.initializer

      // We only care about property accesses, direct method invocation on
      // dispatcher is still okay. This excludes things like
      // <A foo={1} />, <B foo={this.method()} />, <C foo={{ foo: 'bar' }} etc.
      if (
        !jsxExpression.expression ||
        jsxExpression.expression.kind !== ts.SyntaxKind.PropertyAccessExpression
      ) {
        return
      }

      const propAccess: ts.PropertyAccessExpression = jsxExpression.expression as ts.PropertyAccessExpression
      const propAccessText = propAccess.getText()

      if (/^this\.props\.dispatcher\./.test(propAccessText)) {
        const start = propAccess.getStart()
        const width = propAccess.getWidth()
        const error = `Use of unbound dispatcher method: ${propAccessText}.`
        const explanation =
          'Consider extracting the method call to a bound instance method.'

        const message = `${error} ${explanation}`

        this.addFailure(this.createFailure(start, width, message))
      }
    })
  }
}

export class Rule extends Lint.Rules.AbstractRule {
  public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
    if (sourceFile.languageVariant === ts.LanguageVariant.JSX) {
      return this.applyWithWalker(
        new ReactNoUnboundDispatcherPropsWalker(sourceFile, this.getOptions())
      )
    } else {
      return []
    }
  }
}
