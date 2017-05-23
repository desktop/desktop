/**
 * no-sync-functions
 *
 * Don't allow calling any functions that end in 'Sync'.
 */

import * as ts from 'typescript'
import * as Lint from 'tslint'

export class Rule extends Lint.Rules.AbstractRule {
    public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
      return this.applyWithWalker(new NoSyncFunctionsWalker(sourceFile, this.getOptions()))
    }
}

// The walker takes care of all the work.
class NoSyncFunctionsWalker extends Lint.RuleWalker {
  protected visitCallExpression(node: ts.CallExpression): void {
    const functionName = this.getFunctionName(node)
    if (functionName && functionName.endsWith('Sync')) {
      const start = node.getStart()
      const width = node.getWidth()
      const error = `Synchronous functions shouldn't be used. Find an asynchronous alternative.`
      this.addFailure(this.createFailure(start, width, error))
    } else {
      super.visitCallExpression(node)
    }
  }

  // Taken from https://github.com/Microsoft/tslint-microsoft-contrib/blob/051abda5bafffd8068c42bdc9da7afc488cfab76/src/utils/AstUtils.ts#L16-L23.
  private getFunctionName(node: ts.CallExpression): string {
    const expression: ts.Expression = node.expression
    let functionName: string = (expression as any).text
    if (functionName === undefined && (expression as any).name) {
      functionName = (expression as any).name.text
    }
    return functionName
  }
}
