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
    const { title, pullRequestNumber, base, body } = this.props.pullRequest
    const displayBody =
      body !== undefined && body !== null && body.trim() !== ''
        ? body
        : '_No description provided._'
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
        <SandboxedMarkdown markdown={displayBody} baseHref={this.baseHref} />
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
