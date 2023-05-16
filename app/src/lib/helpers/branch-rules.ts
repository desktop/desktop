import { BranchRulesetInfo } from "../../models/ruleset-rule";
import { IAPIRulesetRule } from "../api";

/**
 * Parses the GitHub API response for a branch's ruleset rules into a more useable
 * format.
 */
export function parseRulesetRules(rules: ReadonlyArray<IAPIRulesetRule>): BranchRulesetInfo {
  const info = new BranchRulesetInfo()

  for (const rule of rules) {
    switch (rule.type) {
      case 'update':
      case 'required_linear_history':
      case 'required_deployments':
      case 'required_signatures':
      case 'required_status_checks':
        info.basicCommitWarning = true
        break

      case 'creation':
        info.creationRestricted = true
        break

      case 'deletion':
        info.deletionRestricted = true
        break

      case 'pull_request':
        info.pullRequestRequired = true
        break

      case 'non_fast_forward':
        info.forcePushesBlocked = true
        break

      case 'commit_message_pattern':
        info.commitMessagePattern = rule.parameters
        break

      case 'commit_author_email_pattern':
        info.commitAuthorEmailPattern = rule.parameters
        break

      case 'committer_email_pattern':
        info.committerEmailPattern = rule.parameters
        break

      case 'branch_name_pattern':
        info.branchNamePattern = rule.parameters
        break
    }
  }

  return info
}
