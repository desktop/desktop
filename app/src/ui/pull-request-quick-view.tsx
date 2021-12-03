import * as React from 'react'
import { PullRequest } from '../models/pull-request'
import { PullRequestBadge } from './branches'
import { Dispatcher } from './dispatcher'
import { Button } from './lib/button'
import { SandboxedMarkdown } from './lib/sandboxed-markdown'
import { Octicon } from './octicons'
import * as OcticonSymbol from './octicons/octicons.generated'

interface IPullRequestQuickViewProps {
  readonly dispatcher: Dispatcher
  readonly pullRequest: PullRequest

  /** When mouse leaves the PR quick view */
  readonly onMouseLeave: () => void
}

export class PullRequestQuickView extends React.Component<
  IPullRequestQuickViewProps,
  {}
> {
  // TO BE PROPS
  private mockPRBody =
    'Closes #13419\n' +
    '\n## Description\n\n' +
    '\nRepro steps:\n' +
    '1. Have uncommitted changes\n' +
    '2. Attempt to cherry-pick a commit. Note there are three entry points. 1) drag and drop to an existing branch 2). drag to new branch and 3) context menu.\n' +
    '3. On popup, hit stash and continue\n' +
    'As reported in the bug, the app would freeze during cherry-pick stashing, because on attempt to run retry method the multi commit operation would be null. This is because the Local Changes Overridden dialog is not part of the multi commit operation flow and yet dismissing it would technically end the flow. Thus, we end the flow on the dialog opening so that it is not in a state of cherry-pick if the user dismisses. Unfortunately, during refactor the initialization of the mutli comitt operation was moved farther back then the retry method. Thus, this PR adds an if clause in the retry methods (there are 2 since there are 3 entry points to cherry-pick) to re initialize if state does not exist.\n' +
    '\n## Release notes\n' +
    'Notes: [Fixed] App no longer freezes on stash dialog if cherry-picking with uncommitted changes present.\n'

  private baseHref = 'https://github.com/'

  private renderHeader = (): JSX.Element => {
    return (
      <header className="header">
        <Octicon symbol={OcticonSymbol.listUnordered} />
        <div className="action-needed">Review requested</div>
        <Button className="button-with-icon">
          View on GitHub
          <Octicon symbol={OcticonSymbol.linkExternal} />
        </Button>
      </header>
    )
  }

  private renderPR = (): JSX.Element => {
    const { title, pullRequestNumber, base } = this.props.pullRequest
    return (
      <div className="pull-request">
        <div className="status">
          <Octicon className="icon" symbol={OcticonSymbol.gitPullRequest} />
          <span className="state">Open</span>
        </div>
        <div className="title">
          <h2>{title}</h2>
          <PullRequestBadge
            number={pullRequestNumber}
            dispatcher={this.props.dispatcher}
            repository={base.gitHubRepository}
          />
        </div>
        <SandboxedMarkdown
          markdown={this.mockPRBody}
          baseHref={this.baseHref}
        />
      </div>
    )
  }

  private onMouseLeave = () => {
    this.props.onMouseLeave()
  }

  public render() {
    return (
      <div id="pull-request-quick-view" onMouseLeave={this.onMouseLeave}>
        <div className="pull-request-quick-view-contents">
          {this.renderHeader()}
          {this.renderPR()}
        </div>
      </div>
    )
  }
}
