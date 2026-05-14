import * as React from 'react'
import { writeFile } from 'fs/promises'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../dispatcher'
import { IGraphState } from '../../lib/app-state'
import { List } from '../lib/list'
import { Emoji } from '../../lib/emoji'
import { FancyTextBox } from '../lib/fancy-text-box'
import { TextBox } from '../lib/text-box'
import { BranchList } from '../branches'
import { BranchListItem } from '../branches/branch-list-item'
import { IBranchListItem } from '../branches/group-branches'
import { IMatches } from '../../lib/fuzzy-find'
import { SelectionSource } from '../lib/filter-list'
import { showContextualMenu } from '../../lib/menu-item'
import { showSaveDialog } from '../main-process-proxy'
import * as octicons from '../octicons/octicons.generated'
import { computeGraphLayout, IGraphLayout } from '../../lib/graph/layout'
import { GraphRow, ROW_HEIGHT } from './graph-row'
import { renderGraphToSvg, svgToPngBytes } from './export-graph'

interface IGraphSidebarProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly graphState: IGraphState
  readonly selectedSHA: string | null
  /** Reserved for future use (rendering :emoji: in commit subjects). */
  readonly emoji: Map<string, Emoji>
  /** The currently checked-out branch (HEAD), if any. */
  readonly currentBranch: Branch | null
  /** The repo's default branch (e.g. main), if known. */
  readonly defaultBranch: Branch | null
  /** All known branches (local + remote tracking). */
  readonly allBranches: ReadonlyArray<Branch>
  /** Recently checked out branches. */
  readonly recentBranches: ReadonlyArray<Branch>
}

interface IGraphSidebarState {
  readonly layout: IGraphLayout | null
  readonly showBranchList: boolean
  readonly filterText: string
  readonly focusedBranch: Branch | null
}

export class GraphSidebar extends React.Component<
  IGraphSidebarProps,
  IGraphSidebarState
> {
  private textbox: TextBox | null = null
  private branchList: BranchList | null = null

  public constructor(props: IGraphSidebarProps) {
    super(props)
    this.state = {
      layout: computeLayoutIfReady(props.graphState.commits),
      showBranchList: false,
      filterText: '',
      focusedBranch: null,
    }
  }

  public componentDidMount() {
    if (
      this.props.graphState.commits.length === 0 &&
      !this.props.graphState.isLoading
    ) {
      this.props.dispatcher.loadGraphCommits(this.props.repository)
    }
  }

  public componentDidUpdate(prevProps: IGraphSidebarProps) {
    if (prevProps.graphState.commits !== this.props.graphState.commits) {
      this.setState({
        layout: computeLayoutIfReady(this.props.graphState.commits),
      })
    }
  }

  private onRowClick = (row: number) => {
    const commit = this.props.graphState.commits[row]
    if (commit === undefined) {
      return
    }
    this.props.dispatcher.changeCommitSelection(
      this.props.repository,
      [commit.sha],
      true
    )
    this.props.dispatcher.loadChangedFilesForCurrentSelection(
      this.props.repository
    )
  }

  private onContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    const layout = this.state.layout
    const haveGraph =
      layout !== null && this.props.graphState.commits.length > 0
    showContextualMenu([
      {
        label: 'Export Graph as PNG…',
        enabled: haveGraph,
        action: () => {
          this.exportGraphAsPng()
        },
      },
    ])
  }

  private exportGraphAsPng = async () => {
    const layout = this.state.layout
    const commits = this.props.graphState.commits
    if (layout === null || commits.length === 0) {
      return
    }

    const result = await showSaveDialog({
      title: 'Export Branch Graph',
      defaultPath: 'branch-graph.png',
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    })

    if (result === null) {
      return
    }

    const { svg, width, height } = renderGraphToSvg(commits, layout, {
      background: '#0d1117',
      textColor: '#e6edf3',
      secondaryTextColor: '#8b949e',
    })

    try {
      const png = await svgToPngBytes(svg, width, height)
      await writeFile(result, png)
    } catch (e) {
      log.error('Failed to export branch graph', e)
    }
  }

  private renderRow = (index: number): JSX.Element | null => {
    const commit = this.props.graphState.commits[index]
    const node = this.state.layout?.nodes[index]

    if (!commit || !node) {
      return null
    }

    return (
      <GraphRow
        commit={commit}
        node={node}
        maxLane={this.state.layout?.maxLane ?? 0}
      />
    )
  }

  private onTextBoxRef = (textbox: TextBox) => {
    this.textbox = textbox
  }

  private onBranchesListRef = (branchList: BranchList | null) => {
    this.branchList = branchList
  }

  private onTextBoxFocused = () => {
    this.setState({ showBranchList: true })
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private handleEscape = () => {
    this.setState({ showBranchList: false, focusedBranch: null })
    if (this.textbox) {
      this.textbox.blur()
    }
  }

  private onFilterKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      this.handleEscape()
    } else if (event.key === 'ArrowDown' && this.branchList !== null) {
      this.branchList.selectNextItem(true, 'down')
    } else if (event.key === 'ArrowUp' && this.branchList !== null) {
      this.branchList.selectNextItem(true, 'up')
    } else if (event.key === 'Enter' && this.state.focusedBranch !== null) {
      this.selectBranch(this.state.focusedBranch)
    }
  }

  private onSelectionChanged = (
    branch: Branch | null,
    _source: SelectionSource
  ) => {
    this.setState({ focusedBranch: branch })
  }

  private onBranchItemClick = (branch: Branch) => {
    this.selectBranch(branch)
  }

  private selectBranch(branch: Branch) {
    this.setState({
      showBranchList: false,
      focusedBranch: null,
      filterText: '',
    })
    if (this.textbox) {
      this.textbox.blur()
    }
    this.props.dispatcher.setGraphBranch(this.props.repository, branch.name)
  }

  private renderBranchListItem = (
    item: IBranchListItem,
    matches: IMatches,
    authorDate: Date | undefined
  ) => {
    const { currentBranch } = this.props
    return (
      <BranchListItem
        name={item.branch.name}
        isCurrentBranch={
          currentBranch !== null && item.branch.name === currentBranch.name
        }
        matches={matches}
        authorDate={authorDate}
      />
    )
  }

  private getBranchAriaLabel = (item: IBranchListItem): string =>
    item.branch.name

  private getActiveBranchName(): string {
    const { graphState, currentBranch } = this.props
    if (graphState.selectedBranchName !== null) {
      return graphState.selectedBranchName
    }
    return currentBranch?.name ?? ''
  }

  public render() {
    const { graphState, selectedSHA, allBranches } = this.props
    const { showBranchList, filterText, layout } = this.state

    const activeBranchName = this.getActiveBranchName()
    const placeholder =
      activeBranchName.length > 0 ? activeBranchName : 'Select a branch'

    const disabled = !allBranches.some(b => !b.isDesktopForkRemoteBranch)

    return (
      <div
        className="graph-sidebar"
        role="tabpanel"
        aria-labelledby="graph-tab"
        onContextMenu={this.onContextMenu}
      >
        <div className="compare-form">
          <FancyTextBox
            ariaLabel="Branch filter"
            symbol={octicons.gitBranch}
            displayClearButton={true}
            placeholder={placeholder}
            onFocus={this.onTextBoxFocused}
            value={filterText}
            disabled={disabled}
            onRef={this.onTextBoxRef}
            onValueChanged={this.onFilterTextChanged}
            onKeyDown={this.onFilterKeyDown}
            onSearchCleared={this.handleEscape}
          />
        </div>

        {showBranchList
          ? this.renderBranchList()
          : this.renderGraphBody(graphState, layout, selectedSHA)}
      </div>
    )
  }

  private renderBranchList(): JSX.Element {
    const { defaultBranch, currentBranch, allBranches, recentBranches } =
      this.props

    return (
      <BranchList
        repository={this.props.repository}
        ref={this.onBranchesListRef}
        defaultBranch={defaultBranch}
        currentBranch={currentBranch}
        allBranches={allBranches}
        recentBranches={recentBranches}
        filterText={this.state.filterText}
        textbox={this.textbox!}
        selectedBranch={this.state.focusedBranch}
        canCreateNewBranch={false}
        onSelectionChanged={this.onSelectionChanged}
        onItemClick={this.onBranchItemClick}
        onFilterTextChanged={this.onFilterTextChanged}
        renderBranch={this.renderBranchListItem}
        getBranchAriaLabel={this.getBranchAriaLabel}
      />
    )
  }

  private renderGraphBody(
    graphState: IGraphState,
    layout: IGraphLayout | null,
    selectedSHA: string | null
  ): JSX.Element {
    if (graphState.isLoading && graphState.commits.length === 0) {
      return <div className="graph-empty-state">Loading branch graph…</div>
    }

    if (graphState.errorMessage !== null) {
      return <div className="graph-empty-state">{graphState.errorMessage}</div>
    }

    if (layout === null || graphState.commits.length === 0) {
      return <div className="graph-empty-state">No commits to show.</div>
    }

    const selectedRow =
      selectedSHA === null
        ? -1
        : graphState.commits.findIndex(c => c.sha === selectedSHA)

    return (
      <List
        rowCount={graphState.commits.length}
        rowHeight={ROW_HEIGHT}
        rowRenderer={this.renderRow}
        selectedRows={selectedRow >= 0 ? [selectedRow] : []}
        onRowClick={this.onRowClick}
      />
    )
  }
}

function computeLayoutIfReady(
  commits: ReadonlyArray<Commit>
): IGraphLayout | null {
  if (commits.length === 0) {
    return null
  }
  return computeGraphLayout(commits)
}
