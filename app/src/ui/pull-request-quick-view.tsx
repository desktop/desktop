import * as React from 'react'
import { clamp } from '../lib/clamp'
import { PullRequest } from '../models/pull-request'
import { PullRequestBadge } from './branches'
import { Dispatcher } from './dispatcher'
import { Button } from './lib/button'
import { SandboxedMarkdown } from './lib/sandboxed-markdown'
import { Octicon } from './octicons'
import * as OcticonSymbol from './octicons/octicons.generated'

/**
 * The max height of the visible quick view card is 556 (500 for scrollable
 * body and 56 for header)
 */
const maxQuickViewHeight = 556

interface IPullRequestQuickViewProps {
  readonly dispatcher: Dispatcher
  readonly pullRequest: PullRequest

  readonly pullRequestItemTop: number

  /** When mouse leaves the PR quick view */
  readonly onMouseLeave: () => void
}

interface IPullRequestQuickViewState {
  readonly position: React.CSSProperties | undefined
}

export class PullRequestQuickView extends React.Component<
  IPullRequestQuickViewProps,
  IPullRequestQuickViewState
> {
  private quickViewRef: HTMLDivElement | null = null
  private baseHref = 'https://github.com/'

  public constructor(props: IPullRequestQuickViewProps) {
    super(props)

    this.state = {
      position: this.calculatePosition(
        props.pullRequestItemTop,
        maxQuickViewHeight
      ),
    }
  }

  public componentDidUpdate = (prevProps: IPullRequestQuickViewProps) => {
    if (
      prevProps.pullRequest.body === this.props.pullRequest.body ||
      this.quickViewRef === null
    ) {
      return
    }

    this.setState({
      position: this.calculatePosition(
        this.props.pullRequestItemTop,
        this.quickViewRef.clientHeight
      ),
    })
  }

  /**
   * Important to retrieve as it changes for maximization on macOS and quick
   * view is relative to the top of branch container = foldout-container. But if
   * we can't find it (unlikely) we can atleast compensate for the toolbar being
   * 50px
   */
  private getTopPRList(): number {
    return (
      document.getElementById('foldout-container')?.getBoundingClientRect()
        .top ?? 50
    )
  }

  private calculatePosition(
    prListItemTop: number,
    quickViewHeight: number
  ): React.CSSProperties | undefined {
    const topOfPRList = this.getTopPRList()
    // This is currently staticly defined so not bothering to attain it from
    // dom searching.
    const heightPRListItem = 47

    // Check if it has room to display aligned to top (likely top half of list)
    if (window.innerHeight - prListItemTop > quickViewHeight) {
      return { top: prListItemTop - topOfPRList }
    }

    // Can't align to top -> likely bottom half of list check if has room to display aligned to bottom.
    if (prListItemTop - quickViewHeight > 0) {
      return { bottom: window.innerHeight - prListItemTop - heightPRListItem }
    }

    // If not enough room to display aligned top or bottom, attempt to center
    // with a minimum top/bottom pr list item
    const middlePrListItem = prListItemTop + heightPRListItem / 2
    const middleQuickView = quickViewHeight / 2
    const maxTop = window.innerHeight - topOfPRList - quickViewHeight
    return { top: clamp(middlePrListItem - middleQuickView, 0, maxTop) }
  }

  private onQuickViewRef = (quickViewRef: HTMLDivElement) => {
    this.quickViewRef = quickViewRef
  }

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
      <div
        id="pull-request-quick-view"
        onMouseLeave={this.onMouseLeave}
        style={this.state.position}
        ref={this.onQuickViewRef}
      >
        <div className="pull-request-quick-view-contents">
          {this.renderHeader()}
          {this.renderPR()}
        </div>
      </div>
    )
  }
}
