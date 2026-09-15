import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  APIRepoRuleMetadataOperator,
  APIRepoRuleType,
  IAPIRepoRule,
  IAPIRepoRuleset,
} from '../../src/lib/api'
import { parseRepoRules } from '../../src/lib/helpers/repo-rules'
import {
  RepoRulesMetadataFailures,
  RepoRulesMetadataStatus,
} from '../../src/models/repo-rules'
import { Repository } from '../../src/models/repository'
import { getEnforcedRuleDescriptions } from '../../src/lib/stores/copilot-store'

const creationRule: IAPIRepoRule = {
  ruleset_id: 1,
  type: APIRepoRuleType.Creation,
}

const creationBypassAlwaysRule: IAPIRepoRule = {
  ruleset_id: 2,
  type: APIRepoRuleType.Creation,
}

const creationBypassPullRequestsOnlyRule: IAPIRepoRule = {
  ruleset_id: 3,
  type: APIRepoRuleType.Creation,
}

const commitMessagePatternStartsWithRule: IAPIRepoRule = {
  ruleset_id: 1,
  type: APIRepoRuleType.CommitMessagePattern,
  parameters: {
    name: '',
    negate: false,
    pattern: 'abc',
    operator: APIRepoRuleMetadataOperator.StartsWith,
  },
}

const commitMessagePatternStartsWithBypassRule: IAPIRepoRule = {
  ruleset_id: 2,
  type: APIRepoRuleType.CommitMessagePattern,
  parameters: {
    name: '',
    negate: false,
    pattern: 'abc',
    operator: APIRepoRuleMetadataOperator.StartsWith,
  },
}

const commitMessagePatternSpecialCharactersRule: IAPIRepoRule = {
  ruleset_id: 1,
  type: APIRepoRuleType.CommitMessagePattern,
  parameters: {
    name: '',
    negate: false,
    pattern: '(a.b.c.)|(d+)\\d', // API response is backslash escaped like this
    operator: APIRepoRuleMetadataOperator.StartsWith,
  },
}

const commitMessagePatternEndsWithRule: IAPIRepoRule = {
  ruleset_id: 1,
  type: APIRepoRuleType.CommitMessagePattern,
  parameters: {
    name: '',
    negate: true,
    pattern: 'end',
    operator: APIRepoRuleMetadataOperator.EndsWith,
  },
}

const commitMessagePatternContainsRule: IAPIRepoRule = {
  ruleset_id: 1,
  type: APIRepoRuleType.CommitMessagePattern,
  parameters: {
    name: '',
    negate: true,
    pattern: 'con',
    operator: APIRepoRuleMetadataOperator.Contains,
  },
}

const commitMessagePatternRegexRule1: IAPIRepoRule = {
  ruleset_id: 1,
  type: APIRepoRuleType.CommitMessagePattern,
  parameters: {
    name: '',
    negate: false,
    pattern: '(a.b.c.)|(d+)',
    operator: APIRepoRuleMetadataOperator.RegexMatch,
  },
}

const commitMessagePatternRegexRule2: IAPIRepoRule = {
  ruleset_id: 1,
  type: APIRepoRuleType.CommitMessagePattern,
  parameters: {
    name: '',
    negate: false,
    pattern: '^\\A(d|e)oo\\d$', // API response is backslash escaped like this
    operator: APIRepoRuleMetadataOperator.RegexMatch,
  },
}

const commitMessagePatternRegexMultiLineRule: IAPIRepoRule = {
  ruleset_id: 1,
  type: APIRepoRuleType.CommitMessagePattern,
  parameters: {
    name: '',
    negate: false,
    pattern: '(?m)^foo',
    operator: APIRepoRuleMetadataOperator.RegexMatch,
  },
}

const rulesets: ReadonlyMap<number, IAPIRepoRuleset> = new Map([
  [
    1,
    {
      id: 1,
      current_user_can_bypass: 'never',
    },
  ],
  [
    2,
    {
      id: 2,
      current_user_can_bypass: 'always',
    },
  ],
])

function validateMetadataRules(
  rules: RepoRulesMetadataFailures,
  status: RepoRulesMetadataStatus,
  bypassesExpected: number,
  failuresExpected: number
): void {
  assert.equal(rules.status, status)
  assert.equal(rules.bypassed.length, bypassesExpected)
  assert.equal(rules.failed.length, failuresExpected)
}

const repo = new Repository('repo1', 1, null, false)

describe('await parseRepoRules', () => {
  it('cannot bypass when bypass is "never"', async () => {
    // the creation rule references ruleset ID 1, which has a bypass of 'never'
    const rules = [creationRule]
    const result = await parseRepoRules(rules, rulesets, repo)
    assert(result.creationRestricted)
  })

  it('can bypass when bypass is "always"', async () => {
    // the creationBypass rule references ruleset ID 2, which has a bypass of 'always'
    const rules = [creationBypassAlwaysRule]
    const result = await parseRepoRules(rules, rulesets, repo)
    assert.equal(result.creationRestricted, 'bypass')
  })

  it('cannot bypass when at least one bypass mode is "never" or "pull_requests_only"', async () => {
    const rules = [creationRule, creationBypassAlwaysRule]
    const result = await parseRepoRules(rules, rulesets, repo)
    assert(result.creationRestricted)

    const rules2 = [creationRule, creationBypassPullRequestsOnlyRule]
    const result2 = await parseRepoRules(rules2, rulesets, repo)
    assert(result2.creationRestricted)
  })

  it('is not enforced when no rules are provided', async () => {
    const rules: IAPIRepoRule[] = []
    const repoRulesInfo = await parseRepoRules(rules, rulesets, repo)
    assert(!repoRulesInfo.creationRestricted)
  })
})

describe('repo metadata rules', () => {
  describe('startsWith rule', () => {
    it('shows no rules and passes everything when no rules are provided', async () => {
      const rules: IAPIRepoRule[] = []
      const repoRulesInfo = await parseRepoRules(rules, rulesets, repo)
      assert(!repoRulesInfo.commitMessagePatterns.hasRules)

      const failedRules =
        repoRulesInfo.commitMessagePatterns.getFailedRules('abc')
      validateMetadataRules(failedRules, 'pass', 0, 0)
    })

    it('has correct matching logic for StartsWith rule', async () => {
      const rules = [commitMessagePatternStartsWithRule]
      const repoRulesInfo = await parseRepoRules(rules, rulesets, repo)
      assert(repoRulesInfo.commitMessagePatterns.hasRules)

      const failedRules =
        repoRulesInfo.commitMessagePatterns.getFailedRules('def')
      validateMetadataRules(failedRules, 'fail', 0, 1)
      assert.equal(failedRules.failed[0].description, 'must start with "abc"')
    })

    it('has correct bypass logic for StartsWith rule', async () => {
      const rules = [commitMessagePatternStartsWithBypassRule]
      const repoRulesInfo = await parseRepoRules(rules, rulesets, repo)

      const failedRules =
        repoRulesInfo.commitMessagePatterns.getFailedRules('def')
      validateMetadataRules(failedRules, 'bypass', 1, 0)
      assert.equal(failedRules.bypassed[0].description, 'must start with "abc"')
    })

    it('has correct logic when bypassed rule is included with non-bypassed rule', async () => {
      const rules = [
        commitMessagePatternStartsWithRule,
        commitMessagePatternStartsWithBypassRule,
      ]
      const repoRulesInfo = await parseRepoRules(rules, rulesets, repo)

      const failedRules =
        repoRulesInfo.commitMessagePatterns.getFailedRules('def')
      validateMetadataRules(failedRules, 'fail', 1, 1)
      assert.equal(failedRules.bypassed[0].description, 'must start with "abc"')
      assert.equal(failedRules.failed[0].description, 'must start with "abc"')
    })

    it('escapes special characters and otherwise handles regex properly', async () => {
      const rules = [commitMessagePatternSpecialCharactersRule]
      const repoRulesInfo = await parseRepoRules(rules, rulesets, repo)

      // if the . in the pattern is interpreted as a regex special character, this will pass
      const rules1 =
        repoRulesInfo.commitMessagePatterns.getFailedRules('aabbcc')
      assert.equal(rules1.status, 'fail')

      const rules2 = repoRulesInfo.commitMessagePatterns.getFailedRules('dd')
      assert.equal(rules2.status, 'fail')

      const passedRules =
        repoRulesInfo.commitMessagePatterns.getFailedRules('(a.b.c.)|(d+)\\d')
      assert.equal(passedRules.status, 'pass')
    })
  })

  describe('endsWith rule', () => {
    it('has correct matching logic for negated EndsWith rule', async () => {
      const rules = [commitMessagePatternEndsWithRule]
      const repoRulesInfo = await parseRepoRules(rules, rulesets, repo)

      const failedRules =
        repoRulesInfo.commitMessagePatterns.getFailedRules('end')
      validateMetadataRules(failedRules, 'fail', 0, 1)
      assert.equal(failedRules.failed[0].description, 'must not end with "end"')

      const passedRules =
        repoRulesInfo.commitMessagePatterns.getFailedRules('abc')
      validateMetadataRules(passedRules, 'pass', 0, 0)
    })
  })

  describe('contains rule', () => {
    it('has correct matching logic for Contains rule', async () => {
      const rules = [commitMessagePatternContainsRule]
      const repoRulesInfo = await parseRepoRules(rules, rulesets, repo)

      const failedRules =
        repoRulesInfo.commitMessagePatterns.getFailedRules('fooconbar')
      validateMetadataRules(failedRules, 'fail', 0, 1)
      assert.equal(failedRules.failed[0].description, 'must not contain "con"')

      const passedRules =
        repoRulesInfo.commitMessagePatterns.getFailedRules('foobar')
      validateMetadataRules(passedRules, 'pass', 0, 0)
    })
  })

  describe('regex rule', () => {
    it('has correct matching logic for RegexMatch rule', async () => {
      const rules = [
        commitMessagePatternRegexRule1,
        commitMessagePatternRegexRule2,
      ]
      const repoRulesInfo = await parseRepoRules(rules, rulesets, repo)

      const results1 =
        repoRulesInfo.commitMessagePatterns.getFailedRules('doo5')
      validateMetadataRules(results1, 'pass', 0, 0)

      const results2 =
        repoRulesInfo.commitMessagePatterns.getFailedRules('afbgch')
      validateMetadataRules(results2, 'fail', 0, 1)
      assert.equal(
        results2.failed[0].description,
        'must match the regular expression "^\\A(d|e)oo\\d$"'
      )

      const results3 =
        repoRulesInfo.commitMessagePatterns.getFailedRules('eoo4')
      validateMetadataRules(results3, 'fail', 0, 1)
      assert.equal(
        results3.failed[0].description,
        'must match the regular expression "(a.b.c.)|(d+)"'
      )

      const results4 =
        repoRulesInfo.commitMessagePatterns.getFailedRules('fgsa')
      validateMetadataRules(results4, 'fail', 0, 2)
      assert.equal(
        results4.failed[0].description,
        'must match the regular expression "(a.b.c.)|(d+)"'
      )
      assert.equal(
        results4.failed[1].description,
        'must match the regular expression "^\\A(d|e)oo\\d$"'
      )
    })

    it('has correct matching logic for multi-line data', async () => {
      const rules = [commitMessagePatternRegexMultiLineRule]
      const repoRulesInfo = await parseRepoRules(rules, rulesets, repo)

      const results1 =
        repoRulesInfo.commitMessagePatterns.getFailedRules('first line\nfoo')
      validateMetadataRules(results1, 'pass', 0, 0)

      const results2 =
        repoRulesInfo.commitMessagePatterns.getFailedRules('asdf\nbar')
      validateMetadataRules(results2, 'fail', 0, 1)
      assert.equal(
        results2.failed[0].description,
        'must match the regular expression "(?m)^foo"'
      )
    })
  })
})

describe('getEnforcedRuleDescriptions', () => {
  it('returns an empty array when no rules are configured', async () => {
    const repoRulesInfo = await parseRepoRules([], rulesets, repo)
    assert.deepEqual(
      getEnforcedRuleDescriptions(
        repoRulesInfo.commitMessagePatterns.getRules()
      ),
      []
    )
  })

  it('returns descriptions for enforced rules', async () => {
    // Ruleset 1 has bypass 'never' -> enforced === true
    const repoRulesInfo = await parseRepoRules(
      [commitMessagePatternStartsWithRule],
      rulesets,
      repo
    )
    assert.deepEqual(
      getEnforcedRuleDescriptions(
        repoRulesInfo.commitMessagePatterns.getRules()
      ),
      ['must start with "abc"']
    )
  })

  it('returns descriptions for bypass-able rules (still evaluated by github.com)', async () => {
    // Ruleset 2 has bypass 'always' -> enforced === 'bypass'
    const repoRulesInfo = await parseRepoRules(
      [commitMessagePatternStartsWithBypassRule],
      rulesets,
      repo
    )
    assert.deepEqual(
      getEnforcedRuleDescriptions(
        repoRulesInfo.commitMessagePatterns.getRules()
      ),
      ['must start with "abc"']
    )
  })

  it('returns descriptions for both enforced and bypass-able rules together', async () => {
    const repoRulesInfo = await parseRepoRules(
      [
        commitMessagePatternStartsWithRule,
        commitMessagePatternStartsWithBypassRule,
        commitMessagePatternEndsWithRule,
      ],
      rulesets,
      repo
    )
    assert.deepEqual(
      getEnforcedRuleDescriptions(
        repoRulesInfo.commitMessagePatterns.getRules()
      ),
      [
        'must start with "abc"',
        'must start with "abc"',
        'must not end with "end"',
      ]
    )
  })
})
