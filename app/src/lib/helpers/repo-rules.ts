import { RE2JS } from 're2js'
import {
  RepoRulesInfo,
  IRepoRulesMetadataRule,
  RepoRulesMetadataMatcher,
  RepoRuleEnforced,
} from '../../models/repo-rules'
import {
  APIRepoRuleMetadataOperator,
  APIRepoRuleType,
  IAPIRepoRule,
  IAPIRepoRuleMetadataParameters,
  IAPIRepoRuleset,
} from '../api'
import { supportsRepoRules } from '../endpoint-capabilities'
import { Account } from '../../models/account'
import {
  Repository,
  isRepositoryWithGitHubRepository,
} from '../../models/repository'
import { getBooleanConfigValue } from '../git'

/**
 * Returns whether repo rules could potentially exist for the provided account and repository.
 * This only performs client-side checks, such as whether the user is on a free plan
 * and the repo is public.
 */
export function useRepoRulesLogic(
  account: Account | null,
  repository: Repository
): boolean {
  if (
    !account ||
    !repository ||
    !isRepositoryWithGitHubRepository(repository)
  ) {
    return false
  }

  const { endpoint, owner, isPrivate } = repository.gitHubRepository

  if (!supportsRepoRules(endpoint)) {
    return false
  }

  // repo owner's plan can't be checked, only the current user's. purposely return true
  // if the repo owner is someone else, because if the current user is a collaborator on
  // the free plan but the owner is a pro member, then repo rules could still be enabled.
  // errors will be thrown by the API in this case, but there's no way to preemptively
  // check for that.
  if (
    account.login === owner.login &&
    (!account.plan || account.plan === 'free') &&
    isPrivate
  ) {
    return false
  }

  return true
}

/**
 * Parses the GitHub API response for a branch's repo rules into a more useable
 * format.
 */
export async function parseRepoRules(
  rules: ReadonlyArray<IAPIRepoRule>,
  rulesets: ReadonlyMap<number, IAPIRepoRuleset>,
  repository: Repository
): Promise<RepoRulesInfo> {
  const info = new RepoRulesInfo()
  let gpgSignEnabled: boolean | undefined = undefined

  for (const rule of rules) {
    // if a ruleset is null/undefined, then act as if the rule doesn't exist because
    // we don't know what will happen when they push
    const ruleset = rulesets.get(rule.ruleset_id)
    if (ruleset == null) {
      continue
    }

    // a rule may be configured multiple times, and the strictest value always applies.
    // since the rule will not exist in the API response if it's not enforced, we know
    // we're always assigning either 'bypass' or true below. therefore, we only need
    // to check if the existing value is true, otherwise it can always be overridden.
    const enforced =
      ruleset.current_user_can_bypass === 'always' ? 'bypass' : true

    switch (rule.type) {
      case APIRepoRuleType.Update:
      case APIRepoRuleType.RequiredDeployments:
      case APIRepoRuleType.RequiredStatusChecks:
        info.basicCommitWarning =
          info.basicCommitWarning !== true ? enforced : true
        break

      case APIRepoRuleType.Creation:
        info.creationRestricted =
          info.creationRestricted !== true ? enforced : true
        break

      case APIRepoRuleType.RequiredSignatures:
        // check if the user has commit signing configured. if they do, the rule
        // passes and doesn't need to be warned about.
        gpgSignEnabled ??=
          (await getBooleanConfigValue(repository, 'commit.gpgsign')) ?? false

        if (gpgSignEnabled !== true) {
          info.signedCommitsRequired =
            info.signedCommitsRequired !== true ? enforced : true
        }
        break

      case APIRepoRuleType.PullRequest:
        info.pullRequestRequired =
          info.pullRequestRequired !== true ? enforced : true
        break

      case APIRepoRuleType.CommitMessagePattern:
        info.commitMessagePatterns.push(toMetadataRule(rule, enforced))
        break

      case APIRepoRuleType.CommitAuthorEmailPattern:
        info.commitAuthorEmailPatterns.push(toMetadataRule(rule, enforced))
        break

      case APIRepoRuleType.CommitterEmailPattern:
        info.committerEmailPatterns.push(toMetadataRule(rule, enforced))
        break

      case APIRepoRuleType.BranchNamePattern:
        info.branchNamePatterns.push(toMetadataRule(rule, enforced))
        break
    }
  }

  return info
}

function toMetadataRule(
  rule: IAPIRepoRule | undefined,
  enforced: RepoRuleEnforced
): IRepoRulesMetadataRule | undefined {
  if (!rule?.parameters) {
    return undefined
  }

  return {
    enforced,
    matcher: toMatcher(rule.parameters),
    humanDescription: toHumanDescription(rule.parameters),
    rulesetId: rule.ruleset_id,
  }
}

function toHumanDescription(apiParams: IAPIRepoRuleMetadataParameters): string {
  let description = 'must '
  if (apiParams.negate) {
    description += 'not '
  }

  if (apiParams.operator === APIRepoRuleMetadataOperator.RegexMatch) {
    return description + `match the regular expression "${apiParams.pattern}"`
  }

  switch (apiParams.operator) {
    case APIRepoRuleMetadataOperator.StartsWith:
      description += 'start with '
      break

    case APIRepoRuleMetadataOperator.EndsWith:
      description += 'end with '
      break

    case APIRepoRuleMetadataOperator.Contains:
      description += 'contain '
      break
  }

  return description + `"${apiParams.pattern}"`
}

/**
 * Converts the given metadata rule into a matcher function that uses regex to test the rule.
 */
function toMatcher(
  rule: IAPIRepoRuleMetadataParameters | undefined
): RepoRulesMetadataMatcher {
  if (!rule) {
    return () => false
  }

  let regex: RE2JS

  switch (rule.operator) {
    case APIRepoRuleMetadataOperator.StartsWith:
      regex = RE2JS.compile(`^${RE2JS.quote(rule.pattern)}`)
      break

    case APIRepoRuleMetadataOperator.EndsWith:
      regex = RE2JS.compile(`${RE2JS.quote(rule.pattern)}$`)
      break

    case APIRepoRuleMetadataOperator.Contains:
      regex = RE2JS.compile(`.*${RE2JS.quote(rule.pattern)}.*`)
      break

    case APIRepoRuleMetadataOperator.RegexMatch:
      regex = RE2JS.compile(rule.pattern)
      break
  }

  if (regex) {
    if (rule.negate) {
      return (toMatch: string) => !regex.matcher(toMatch).find()
    } else {
      return (toMatch: string) => regex.matcher(toMatch).find()
    }
  } else {
    return () => false
  }
}
