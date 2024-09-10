import * as React from 'react'
import { clamp } from '../lib/clamp'
import { PullRequest } from '../models/pull-request'
import { PullRequestBadge } from './branches'
import { Dispatcher } from './dispatcher'
import { Button } from './lib/button'
import { SandboxedMarkdown } from './lib/sandboxed-markdown'
import { Octicon } from './octicons'
import * as octicons from './octicons/octicons.generated'
import classNames from 'classnames'
import { Emoji } from '../lib/emoji'

/**
 * The max height of the visible quick view card is 556 (500 for scrollable
 * body and 56 for header)
 */
const maxQuickViewHeight = 556
/**
 * This is currently statically defined so not bothering to attain it from dom
 * searching.
 */
const heightPRListItem = 47

interface IPullRequestQuickViewProps {
  readonly dispatcher: Dispatcher
  readonly pullRequest: PullRequest

  readonly pullRequestItemTop: number

  /** When mouse leaves the PR quick view */
  readonly onMouseEnter: () => void

  /** When mouse leaves the PR quick view */
  readonly onMouseLeave: () => void

  /** Map from the emoji shortcut (e.g., :+1:) to the image's local path. */
  readonly emoji: Map<string, Emoji>

  readonly underlineLinks: boolean
}

interface IPullRequestQuickViewState {
  readonly top: number
}

export class PullRequestQuickView extends React.Component<
  IPullRequestQuickViewProps,
  IPullRequestQuickViewState
> {
  private quickViewRef = React.createRef<HTMLDivElement>()

  private get quickViewHeight(): number {
    return this.quickViewRef.current?.clientHeight ?? maxQuickViewHeight
  }

  public constructor(props: IPullRequestQuickViewProps) {
    super(props)

    this.state = {
      top: this.calculatePosition(
        props.pullRequestItemTop,
        this.quickViewHeight
      ),
    }
  }

  public componentDidUpdate = (prevProps: IPullRequestQuickViewProps) => {
    if (
      prevProps.pullRequest.pullRequestNumber ===
      this.props.pullRequest.pullRequestNumber
    ) {
      return
    }

    this.updateQuickViewPosition()
  }

  private updateQuickViewPosition = () => {
    this.setState({
      top: this.calculatePosition(
        this.props.pullRequestItemTop,
        this.quickViewHeight
      ),
    })
  }

  private onMarkdownParsed = () => {
    this.updateQuickViewPosition()
  }

  private onViewOnGitHub = () => {
    this.props.dispatcher.showPullRequestByPR(this.props.pullRequest)
  }

  private onMouseLeave = () => {
    this.props.onMouseLeave()
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
  ): number {
    const topOfPRList = this.getTopPRList()

    // We want to make sure that the quick view is always visible and highest
    // being aligned to top of branch/pr dropdown (which is 0 since this is a
    // child element of the branch dropdown)
    const minTop = 0
    const maxTop = window.innerHeight - topOfPRList - quickViewHeight

    // Check if it has room to display aligned to top (likely top half of list)
    if (window.innerHeight - prListItemTop > quickViewHeight) {
      const alignedTop = prListItemTop - topOfPRList
      return clamp(alignedTop, minTop, maxTop)
    }

    // Can't align to top -> likely bottom half of list check if has room to display aligned to bottom.
    if (prListItemTop - quickViewHeight > 0) {
      const alignedTop = prListItemTop - topOfPRList
      const alignedBottom = alignedTop - quickViewHeight + heightPRListItem
      return clamp(alignedBottom, minTop, maxTop)
    }

    // If not enough room to display aligned top or bottom, attempt to center on
    // list item. For short height screens with max height quick views, this
    // will likely end up being clamped so will be anchored to top or bottom
    // depending on position in list.
    const middlePrListItem = prListItemTop + heightPRListItem / 2
    const middleQuickView = quickViewHeight / 2
    const alignedMiddle = middlePrListItem - middleQuickView
    return clamp(alignedMiddle, minTop, maxTop)
  }

  private getPointerPosition(top: number): React.CSSProperties {
    const prListItemTopWRTQuickViewTopZero =
      this.props.pullRequestItemTop - this.getTopPRList()
    const prListItemPositionWRToQuickViewTop =
      prListItemTopWRTQuickViewTopZero - top
    const centerPointOnListItem =
      prListItemPositionWRToQuickViewTop + heightPRListItem / 2
    return { top: centerPointOnListItem }
  }

  private onMarkdownLinkClicked = (url: string) => {
    this.props.dispatcher.openInBrowser(url)
  }

  private renderHeader = (): JSX.Element => {
    return (
      <header className="header">
        <Octicon symbol={octicons.listUnordered} />
        <div className="action-needed">Review requested</div>
        <Button
          className="button-with-icon"
          onClick={this.onViewOnGitHub}
          role="link"
        >
          View on GitHub
          <Octicon symbol={octicons.linkExternal} />
        </Button>
      </header>
    )
  }

  private renderPRStatus(isDraft: boolean) {
    return (
      <div className={classNames('status', { draft: isDraft })}>
        <Octicon
          className="icon"
          symbol={
            isDraft ? octicons.gitPullRequestDraft : octicons.gitPullRequest
          }
        />
        <span className="state">{isDraft ? 'Draft' : 'Open'}</span>
      </div>
    )
  }

  private renderPR = () => {
    const { title, pullRequestNumber, base, body, draft } =
      this.props.pullRequest
    const displayBody =
      body !== undefined && body !== null && body.trim() !== ''
        ? body
        : '_No description provided._'

    return (
      <div className="pull-request">
        {this.renderPRStatus(draft)}
        <div className="title">
          <h2>{title}</h2>
          <PullRequestBadge
            number={pullRequestNumber}
            dispatcher={this.props.dispatcher}
            repository={base.gitHubRepository}
          />
        </div>
        <SandboxedMarkdown
          markdown={displayBody}
          emoji={this.props.emoji}
          baseHref={base.gitHubRepository.htmlURL ?? undefined}
          repository={base.gitHubRepository}
          markdownContext={'PullRequest'}
          onMarkdownLinkClicked={this.onMarkdownLinkClicked}
          onMarkdownParsed={this.onMarkdownParsed}
          underlineLinks={this.props.underlineLinks}
          ariaLabel="Pull request markdown body"
        />
      </div>
    )
  }

  public render() {
    const { top } = this.state
    return (
      <div
        className="pull-request-quick-view"
        onMouseEnter={this.props.onMouseEnter}
        onMouseLeave={this.onMouseLeave}
        style={{ top }}
        ref={this.quickViewRef}
      >
        <div className="pull-request-quick-view-contents">
          {this.renderHeader()}
          {this.renderPR()}
        </div>
        <div
          className="pull-request-pointer"
          style={this.getPointerPosition(top)}
        ></div>
      </div>
    )
  }
}
