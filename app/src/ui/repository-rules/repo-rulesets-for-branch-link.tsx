import * as React from 'react'
import { GitHubRepository } from '../../models/github-repository'
import { LinkButton } from '../lib/link-button'

interface IRepoRulesetsForBranchLinkProps {
  readonly repository: GitHubRepository | null
  readonly branch: string | null
}

/**
 * Returns a LinkButton to the rulesets page for the given repository and branch. Returns
 * the raw children with no link if the repository or branch are null.
 */
export class RepoRulesetsForBranchLink extends React.Component<
  IRepoRulesetsForBranchLinkProps,
  {}
> {
  public render() {
    const { repository, branch, children } = this.props

    if (!repository || !branch) {
      return children
    }

    const link = `${repository.htmlURL}/rules/?ref=${encodeURIComponent(
      'refs/heads/' + branch
    )}`

    return (
      <LinkButton uri={link} className="repo-rulesets-for-branch-link">
        {children}
      </LinkButton>
    )
  }
}
