// Adapted from ./types/index.d.ts
import { RuleListener, RuleContext } from './types'
import { JSONSchema4 } from 'json-schema'

interface IRuleMetaData<TMessageIds extends string> {
  /**
   * Documentation for the rule
   */
  docs: {
    /**
     * Concise description of the rule
     */
    description: string
    /**
     * The general category the rule falls within
     */
    category: string
  }
  /**
   * The fixer category. Omit if there is no fixer
   */
  fixable?: 'code' | 'whitespace'
  /**
   * A map of messages which the rule can report.
   * The key is the messageId, and the string is the parameterised error string.
   * See: https://eslint.org/docs/developer-guide/working-with-rules#messageids
   */
  messages: Record<TMessageIds, string>
  /**
   * The type of rule.
   * - `"problem"` means the rule is identifying code that either will cause an error or may cause a confusing behavior. Developers should consider this a high priority to resolve.
   * - `"suggestion"` means the rule is identifying something that could be done in a better way but no errors will occur if the code isn’t changed.
   * - `"layout"` means the rule cares primarily about whitespace, semicolons, commas, and parentheses, all the parts of the program that determine how the code looks rather than how it executes. These rules work on parts of the code that aren’t specified in the AST.
   */
  type: 'suggestion' | 'problem' | 'layout'
  /**
   * The options schema. Supply an empty array if there are no options.
   */
  schema?: JSONSchema4 | JSONSchema4[]
}

interface IRuleModule<
  TMessageIds extends string,
  TOptions extends Readonly<any[]>,
  // for extending base rules
  TRuleListener extends RuleListener = RuleListener
> {
  /**
   * Metadata about the rule
   */
  meta: IRuleMetaData<TMessageIds>

  /**
   * Function which returns an object with methods that ESLint calls to “visit”
   * nodes while traversing the abstract syntax tree.
   */
  create(context: RuleContext<TMessageIds, TOptions>): TRuleListener
}

export function createRule<
  TMessageIds extends string,
  TOptions extends unknown[],
  TRuleListener extends RuleListener = RuleListener
>({
  meta,
  create,
}: {
  meta: IRuleMetaData<TMessageIds>
  create: (context: RuleContext<TMessageIds, TOptions>) => TRuleListener
}): IRuleModule<TMessageIds, TOptions, TRuleListener> {
  return { meta, create }
}
