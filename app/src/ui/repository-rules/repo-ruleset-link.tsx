import * as React from 'react'
import { GitHubRepository } from '../../models/github-repository'
import { LinkButton } from '../lib/link-button'

interface IRepoRulesetLinkProps {
  readonly repository: GitHubRepository
  readonly rulesetId: number
}

/**
 * Returns a LinkButton to the webpage for the ruleset with the
 * provided ID within the provided repo.
 */
export class RepoRulesetLink extends React.Component<
  IRepoRulesetLinkProps,
  {}
> {
  public render() {
    const { repository, rulesetId, children } = this.props

    const link = `${repository.htmlURL}/rules/${rulesetId}`

    return (
      <LinkButton uri={link} className="repo-ruleset-link">
        {children}
      </LinkButton>
    )
  }
}
