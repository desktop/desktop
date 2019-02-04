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

import * as ts from 'typescript'
import * as Lint from 'tslint'

class ButtonGroupOrderWalker extends Lint.RuleWalker {
  /**
   * Visit the node and ensure any button children are in the correct order.
   */
  protected visitJsxElement(node: ts.JsxElement): void {
    super.visitJsxElement(node)

    if (node.openingElement.tagName.getText() !== 'ButtonGroup') {
      return
    }

    const buttons = new Array<ts.JsxOpeningLikeElement>()

    // Assert that only <Button> elements and whitespace are allowed inside
    // the ButtonGroup.
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]

      if (child.kind === ts.SyntaxKind.JsxText) {
        // Whitespace is okay.
        if (/^\s*$/.test(child.getText())) {
          continue
        }
      } else if (child.kind === ts.SyntaxKind.JsxElement) {
        if (child.openingElement.tagName.getText() === 'Button') {
          buttons.push(child.openingElement)
          continue
        }
      } else if (child.kind === ts.SyntaxKind.JsxSelfClosingElement) {
        if (child.tagName.getText() === 'Button') {
          buttons.push(child)
          continue
        }
      }

      const start = child.getStart()
      const width = child.getWidth()
      const error = `Forbidden child content, expected <Button>.`
      const explanation = 'ButtonGroups should only contain <Button> elements'

      const message = `${error} ${explanation}`

      this.addFailureAt(start, width, message)
    }

    // If we've emitted any errors we'll bail here rather than try to emit
    // any errors with button order.
    if (this.getFailures().length) {
      return
    }

    if (buttons.length < 2) {
      return
    }

    const buttonsWithTypeAttr = buttons.map(b => {
      const typeAttr = b.attributes.properties.find(
        a =>
          a.kind === ts.SyntaxKind.JsxAttribute && a.name.getText() === 'type'
      ) as ts.JsxAttribute | undefined

      let value = undefined

      if (
        typeAttr &&
        typeAttr.initializer &&
        typeAttr.initializer.kind === ts.SyntaxKind.StringLiteral
      ) {
        value = typeAttr.initializer.text
      }

      return [b, value]
    })

    const primaryButtonIx = buttonsWithTypeAttr.findIndex(
      x => x[1] === 'submit'
    )

    if (primaryButtonIx !== -1 && primaryButtonIx !== 0) {
      const start = node.getStart()
      const width = node.getWidth()
      const error = `Wrong button order in ButtonGroup.`
      const explanation =
        'ButtonGroups should have the primary button as its first child'

      const message = `${error} ${explanation}`

      this.addFailureAt(start, width, message)
    }
  }
}

export class Rule extends Lint.Rules.AbstractRule {
  public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
    if (sourceFile.languageVariant === ts.LanguageVariant.JSX) {
      return this.applyWithWalker(
        new ButtonGroupOrderWalker(sourceFile, this.getOptions())
      )
    } else {
      return []
    }
  }
}
