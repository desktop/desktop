import * as React from 'react'
import {
  IFilterListGroup,
  IFilterListItem,
  SelectionSource,
} from '../lib/filter-list'
import { PullRequestListItem } from './pull-request-list-item'
import { PullRequest } from '../../models/pull-request'
import { NoPullRequests } from './no-pull-requests'
import { IMatches } from '../../lib/fuzzy-find'
import { Dispatcher } from '../dispatcher'
import {
  RepositoryWithGitHubRepository,
  getNonForkGitHubRepository,
} from '../../models/repository'
import { Button } from '../lib/button'
import { Octicon, syncClockwise } from '../octicons'
import { FoldoutType } from '../../lib/app-state'
import { startTimer } from '../lib/timing'
import { DragType } from '../../models/drag-drop'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'
import { formatRelative } from '../../lib/format-relative'
import { AriaLiveContainer } from '../accessibility/aria-live-container'
import { SectionFilterList } from '../lib/section-filter-list'

interface IPullRequestListItem extends IFilterListItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
  readonly pullRequest: PullRequest
}

export const RowHeight = 47

interface IPullRequestListProps {
  /** The pull requests to display. */
  readonly pullRequests: ReadonlyArray<PullRequest>

  /** The currently selected pull request */
  readonly selectedPullRequest: PullRequest | null

  /** Is the default branch currently checked out? */
  readonly isOnDefaultBranch: boolean

  /** Called when the user opts to create a branch */
  readonly onCreateBranch: () => void

  /** Callback fired when user selects a new pull request */
  readonly onSelectionChanged: (
    pullRequest: PullRequest | null,
    source: SelectionSource
  ) => void

  readonly dispatcher: Dispatcher
  readonly repository: RepositoryWithGitHubRepository

  /** Are we currently loading pull requests? */
  readonly isLoadingPullRequests: boolean

  /** When mouse enters a PR */
  readonly onMouseEnterPullRequest: (
    prNumber: PullRequest,
    prListItemTop: number
  ) => void

  /** When mouse leaves a PR */
  readonly onMouseLeavePullRequest: (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => void
}

interface IPullRequestListState {
  readonly filterText: string
  readonly groupedItems: ReadonlyArray<IFilterListGroup<IPullRequestListItem>>
  readonly selectedItem: IPullRequestListItem | null
  readonly screenReaderStateMessage: string | null
}

function resolveSelectedItem(
  group: IFilterListGroup<IPullRequestListItem>,
  props: IPullRequestListProps,
  currentlySelectedItem: IPullRequestListItem | null
): IPullRequestListItem | null {
  let selectedItem: IPullRequestListItem | null = null

  if (props.selectedPullRequest != null) {
    selectedItem = findItemForPullRequest(group, props.selectedPullRequest)
  }

  if (selectedItem == null && currentlySelectedItem != null) {
    selectedItem = findItemForPullRequest(
      group,
      currentlySelectedItem.pullRequest
    )
  }

  return selectedItem
}

/** The list of open pull requests. */
export class PullRequestList extends React.Component<
  IPullRequestListProps,
  IPullRequestListState
> {
  public constructor(props: IPullRequestListProps) {
    super(props)

    const group = createListItems(props.pullRequests)
    const selectedItem = resolveSelectedItem(group, props, null)

    this.state = {
      filterText: '',
      groupedItems: [group],
      selectedItem,
      screenReaderStateMessage: null,
    }
  }

  public componentWillReceiveProps(nextProps: IPullRequestListProps) {
    const group = createListItems(nextProps.pullRequests)
    const selectedItem = resolveSelectedItem(
      group,
      nextProps,
      this.state.selectedItem
    )

    const loadingStarted =
      !this.props.isLoadingPullRequests && nextProps.isLoadingPullRequests
    const loadingComplete =
      this.props.isLoadingPullRequests && !nextProps.isLoadingPullRequests
    const numPullRequests = this.props.pullRequests.length
    const plural = numPullRequests === 1 ? '' : 's'
    const screenReaderStateMessage = loadingStarted
      ? 'Hang Tight. Loading pull requests as fast as I can!'
      : loadingComplete
      ? `${numPullRequests} pull request${plural} found`
      : null

    this.setState({
      groupedItems: [group],
      selectedItem,
      screenReaderStateMessage,
    })
  }

  public render() {
    return (
      <>
        <SectionFilterList<IPullRequestListItem>
          className="pull-request-list"
          rowHeight={RowHeight}
          groups={this.state.groupedItems}
          selectedItem={this.state.selectedItem}
          renderItem={this.renderPullRequest}
          filterText={this.state.filterText}
          onFilterTextChanged={this.onFilterTextChanged}
          invalidationProps={this.props.pullRequests}
          onItemClick={this.onItemClick}
          onSelectionChanged={this.onSelectionChanged}
          renderGroupHeader={this.renderListHeader}
          renderNoItems={this.renderNoItems}
          renderPostFilter={this.renderPostFilter}
        />
        <AriaLiveContainer message={this.state.screenReaderStateMessage} />
      </>
    )
  }

  private renderNoItems = () => {
    return (
      <NoPullRequests
        isSearch={this.state.filterText.length > 0}
        isLoadingPullRequests={this.props.isLoadingPullRequests}
        repositoryName={this.getRepositoryName()}
        isOnDefaultBranch={this.props.isOnDefaultBranch}
        onCreateBranch={this.props.onCreateBranch}
        onCreatePullRequest={this.onCreatePullRequest}
      />
    )
  }

  private renderPullRequest = (
    item: IPullRequestListItem,
    matches: IMatches
  ) => {
    const pr = item.pullRequest

    return (
      <PullRequestListItem
        title={pr.title}
        number={pr.pullRequestNumber}
        created={pr.created}
        author={pr.author}
        draft={pr.draft}
        matches={matches}
        dispatcher={this.props.dispatcher}
        repository={pr.base.gitHubRepository}
        onDropOntoPullRequest={this.onDropOntoPullRequest}
        onMouseEnter={this.onMouseEnterPullRequest}
        onMouseLeave={this.onMouseLeavePullRequest}
      />
    )
  }

  private onMouseEnterPullRequest = (
    prNumber: number,
    prListItemTop: number
  ) => {
    const { pullRequests } = this.props

    // If not the currently checked out pull request, find the full pull request
    // object to start the cherry-pick
    const pr = pullRequests.find(pr => pr.pullRequestNumber === prNumber)
    if (pr === undefined) {
      log.error('[onMouseEnterPullReqest] - Could not find pull request.')
      return
    }

    this.props.onMouseEnterPullRequest(pr, prListItemTop)
  }

  private onMouseLeavePullRequest = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => {
    this.props.onMouseLeavePullRequest(event)
  }

  private onDropOntoPullRequest = (prNumber: number) => {
    const { repository, selectedPullRequest, dispatcher, pullRequests } =
      this.props

    if (!dragAndDropManager.isDragOfTypeInProgress(DragType.Commit)) {
      return
    }

    // If dropped on currently checked out pull request, it is treated the same
    // as dropping on non-pull-request.
    if (
      selectedPullRequest !== null &&
      prNumber === selectedPullRequest.pullRequestNumber
    ) {
      dispatcher.endMultiCommitOperation(repository)
      dispatcher.incrementMetric('dragStartedAndCanceledCount')
      return
    }

    // If not the currently checked out pull request, find the full pull request
    // object to start the cherry-pick
    const pr = pullRequests.find(pr => pr.pullRequestNumber === prNumber)
    if (pr === undefined) {
      log.error('[onDropOntoPullRequest] - Could not find pull request.')
      dispatcher.endMultiCommitOperation(repository)
      return
    }

    dispatcher.startCherryPickWithPullRequest(repository, pr)
  }

  private onItemClick = (
    item: IPullRequestListItem,
    source: SelectionSource
  ) => {
    const pullRequest = item.pullRequest

    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    const timer = startTimer(
      'checkout pull request from list',
      this.props.repository
    )
    this.props.dispatcher
      .checkoutPullRequest(this.props.repository, pullRequest)
      .then(() => timer.done())

    this.props.onSelectionChanged(pullRequest, source)
  }

  private onSelectionChanged = (
    selectedItem: IPullRequestListItem | null,
    source: SelectionSource
  ) => {
    this.props.onSelectionChanged(
      selectedItem != null ? selectedItem.pullRequest : null,
      source
    )
  }

  private getRepositoryName(): string {
    return getNonForkGitHubRepository(this.props.repository).fullName
  }

  private renderListHeader = () => {
    return (
      <div className="filter-list-group-header">
        Pull requests in {this.getRepositoryName()}
      </div>
    )
  }

  private onRefreshPullRequests = () => {
    this.props.dispatcher.refreshPullRequests(this.props.repository)
  }

  private renderPostFilter = () => {
    const tooltip = 'Refresh the list of pull requests'

    return (
      <Button
        disabled={this.props.isLoadingPullRequests}
        onClick={this.onRefreshPullRequests}
        ariaLabel={tooltip}
        tooltip={tooltip}
      >
        <Octicon
          symbol={syncClockwise}
          className={this.props.isLoadingPullRequests ? 'spin' : undefined}
        />
      </Button>
    )
  }

  private onFilterTextChanged = (text: string) => {
    this.setState({ filterText: text })
  }

  private onCreatePullRequest = () => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    this.props.dispatcher.createPullRequest(this.props.repository)
  }
}

function getSubtitle(pr: PullRequest) {
  const timeAgo = formatRelative(pr.created.getTime() - Date.now())
  return `#${pr.pullRequestNumber} opened ${timeAgo} by ${pr.author}`
}

function createListItems(
  pullRequests: ReadonlyArray<PullRequest>
): IFilterListGroup<IPullRequestListItem> {
  const items = pullRequests.map(pr => ({
    text: [pr.title, getSubtitle(pr)],
    id: pr.pullRequestNumber.toString(),
    pullRequest: pr,
  }))

  return {
    identifier: 'pull-requests',
    items,
  }
}

function findItemForPullRequest(
  group: IFilterListGroup<IPullRequestListItem>,
  pullRequest: PullRequest
): IPullRequestListItem | null {
  return (
    group.items.find(
      i => i.pullRequest.pullRequestNumber === pullRequest.pullRequestNumber
    ) || null
  )
}
