import * as React from 'react'
import { GitHubRepository } from '../../models/github-repository'
import {
  RepoRulesMetadataFailure,
  RepoRulesMetadataFailures,
} from '../../models/repo-rules'
import { RepoRulesetsForBranchLink } from './repo-rulesets-for-branch-link'
import { RepoRulesetLink } from './repo-ruleset-link'

interface IRepoRulesMetadataFailureListProps {
  readonly repository: GitHubRepository
  readonly branch: string
  readonly failures: RepoRulesMetadataFailures

  /**
   * Text that will come before the standard text, should be the name of the rule
   * that's being checked. For example, "The email in your global Git config" or
   * "This commit message".
   */
  readonly leadingText: string | JSX.Element
}

/**
 * Returns a standard message for failed repo metadata rules.
 */
export class RepoRulesMetadataFailureList extends React.Component<IRepoRulesMetadataFailureListProps> {
  public render() {
    const { repository, branch, failures, leadingText } = this.props

    const totalFails = failures.failed.length + failures.bypassed.length
    let endText: string
    if (failures.status === 'bypass') {
      endText = `, but you can bypass ${
        totalFails === 1 ? 'it' : 'them'
      }. Proceed with caution!`
    } else {
      endText = '.'
    }

    const rulesText = __DARWIN__ ? 'Rules' : 'rules'

    return (
      <div className="repo-rules-failure-list-component">
        <p>
          {leadingText} fails {totalFails} rule{totalFails > 1 ? 's' : ''}
          {endText}{' '}
          <RepoRulesetsForBranchLink repository={repository} branch={branch}>
            View all rulesets for this branch.
          </RepoRulesetsForBranchLink>
        </p>
        {failures.failed.length > 0 && (
          <div className="repo-rule-list">
            <strong>Failed {rulesText}:</strong>
            {this.renderRuleFailureList(failures.failed)}
          </div>
        )}
        {failures.bypassed.length > 0 && (
          <div className="repo-rule-list">
            <strong>Bypassed {rulesText}:</strong>
            {this.renderRuleFailureList(failures.bypassed)}
          </div>
        )}
      </div>
    )
  }

  private renderRuleFailureList(failures: RepoRulesMetadataFailure[]) {
    return (
      <ul>
        {failures.map(f => (
          <li key={`${f.description}-${f.rulesetId}`}>
            <RepoRulesetLink
              repository={this.props.repository}
              rulesetId={f.rulesetId}
            >
              {f.description}
            </RepoRulesetLink>
          </li>
        ))}
      </ul>
    )
  }
}
