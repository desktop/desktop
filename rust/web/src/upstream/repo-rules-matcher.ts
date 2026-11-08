/// <reference path="./re2js.d.ts" />
import { RE2JS } from 're2js'
import { RepoRulesMetadataMatcher } from './models/repo-rules'

/** Metadata parameters accepted by GitHub's branch and commit pattern rules. */
export interface IRepoRuleMetadataParameters {
  readonly name?: string
  readonly negate: boolean
  readonly pattern: string
  readonly operator: string
}

/**
 * Converts the given metadata rule into a matcher function that uses regex to test the rule.
 */
export function toMatcher(
  rule: IRepoRuleMetadataParameters | undefined
): RepoRulesMetadataMatcher {
  if (!rule) {
    return () => false
  }

  let regex: RE2JS | undefined

  switch (rule.operator) {
    case 'starts_with':
      regex = RE2JS.compile(`^${RE2JS.quote(rule.pattern)}`)
      break

    case 'ends_with':
      regex = RE2JS.compile(`${RE2JS.quote(rule.pattern)}$`)
      break

    case 'contains':
      regex = RE2JS.compile(`.*${RE2JS.quote(rule.pattern)}.*`)
      break

    case 'regex':
      regex = RE2JS.compile(rule.pattern)
      break
  }

  if (regex) {
    if (rule.negate) {
      return (toMatch: string) => !regex.test(toMatch)
    } else {
      return (toMatch: string) => regex.test(toMatch)
    }
  } else {
    return () => false
  }
}
