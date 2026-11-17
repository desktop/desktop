import { randomBytes } from 'crypto'
import { IRepoRulesMetadataRule } from '../models/repo-rules'

/** Descriptions of rules GitHub evaluates, including rules the user may bypass. */
export function getEnforcedRuleDescriptions(
  rules: ReadonlyArray<
    Pick<IRepoRulesMetadataRule, 'enforced' | 'humanDescription'>
  >
): ReadonlyArray<string> {
  return rules
    .filter(r => r.enforced === true || r.enforced === 'bypass')
    .map(r => r.humanDescription)
}

/** Clean, deduplicated single-line constraints for an untrusted prompt block. */
export function getCleanedEnforcedRuleDescriptions(
  rules:
    | ReadonlyArray<
        Pick<IRepoRulesMetadataRule, 'enforced' | 'humanDescription'>
      >
    | undefined
): ReadonlyArray<string> {
  if (!rules) {
    return []
  }
  const descriptions = getEnforcedRuleDescriptions(rules)
  return [
    ...new Set(
      descriptions.map(description =>
        description.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim()
      )
    ),
  ].filter(description => description.length > 0)
}

/** Unpredictable delimiters keep diff and rule contents in the data channel. */
export interface ICommitMessagePromptTags {
  readonly diffOpen: string
  readonly diffClose: string
  readonly repoRulesOpen: string
  readonly repoRulesClose: string
}

/** Generate new trust-boundary delimiters for each request. */
export function generateCommitMessagePromptTags(): ICommitMessagePromptTags {
  const token = randomBytes(8).toString('hex')
  return {
    diffOpen: `<diff-${token}>`,
    diffClose: `</diff-${token}>`,
    repoRulesOpen: `<repo-rules-${token}>`,
    repoRulesClose: `</repo-rules-${token}>`,
  }
}
