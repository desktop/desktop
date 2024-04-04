import * as React from 'react'

import { Branch, BranchType } from '../../models/branch'

import { assertNever } from '../../lib/fatal-error'

import { IFilterListGroup, SelectionSource } from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'

import {
  groupBranches,
  IBranchListItem,
  BranchGroupIdentifier,
} from './group-branches'
import { NoBranches } from './no-branches'
import { SelectionDirection, ClickSource } from '../lib/list'
import { generateBranchContextMenuItems } from './branch-list-item-context-menu'
import { showContextualMenu } from '../../lib/menu-item'
import { SectionFilterList } from '../lib/section-filter-list'

const RowHeight = 30

interface IBranchListProps {
  /**
   * See IBranchesState.defaultBranch
   */
  readonly defaultBranch: Branch | null

  /**
   * The currently checked out branch or null if HEAD is detached
   */
  readonly currentBranch: Branch | null

  /**
   * See IBranchesState.allBranches
   */
  readonly allBranches: ReadonlyArray<Branch>

  /**
   * See IBranchesState.recentBranches
   */
  readonly recentBranches: ReadonlyArray<Branch>

  /**
   * The currently selected branch in the list, see the onSelectionChanged prop.
   */
  readonly selectedBranch: Branch | null

  /**
   * Called when a key down happens in the filter field. Users have a chance to
   * respond or cancel the default behavior by calling `preventDefault`.
   */
  readonly onFilterKeyDown?: (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => void

  /** Called when an item is clicked. */
  readonly onItemClick?: (item: Branch, source: ClickSource) => void

  /**
   * This function will be called when the selection changes as a result of a
   * user keyboard or mouse action (i.e. not when props change). This function
   * will not be invoked when an already selected row is clicked on.
   *
   * @param selectedItem - The Branch that was just selected
   * @param source       - The kind of user action that provoked the change,
   *                       either a pointer device press, or a keyboard event
   *                       (arrow up/down)
   */
  readonly onSelectionChanged?: (
    selectedItem: Branch | null,
    source: SelectionSource
  ) => void

  /** The current filter text to render */
  readonly filterText: string

  /** Callback to fire when the filter text is changed */
  readonly onFilterTextChanged: (filterText: string) => void

  /** Can users create a new branch? */
  readonly canCreateNewBranch: boolean

  /**
   * Called when the user wants to create a new branch. It will be given a name
   * to prepopulate the new branch name field.
   */
  readonly onCreateNewBranch?: (name: string) => void

  readonly textbox?: TextBox

  /** Aria label for a specific row */
  readonly getBranchAriaLabel: (item: IBranchListItem) => string | undefined

  /**
   * Render function to apply to each branch in the list
   */
  readonly renderBranch: (
    item: IBranchListItem,
    matches: IMatches
  ) => JSX.Element

  /**
   * Callback to fire when the items in the filter list are updated
   */
  readonly onFilterListResultsChanged?: (resultCount: number) => void

  /** If true, we do not render the filter. */
  readonly hideFilterRow?: boolean

  /** Called to render content before/above the branches filter and list. */
  readonly renderPreList?: () => JSX.Element | null

  /** Optional: No branches message */
  readonly noBranchesMessage?: string | JSX.Element

  /** Optional: Callback for if rename context menu should exist */
  readonly onRenameBranch?: (branchName: string) => void

  /** Optional: Callback for if delete context menu should exist */
  readonly onDeleteBranch?: (branchName: string) => void
}

interface IBranchListState {
  /**
   * The grouped list of branches.
   *
   * Groups are currently defined as 'default branch', 'current branch',
   * 'recent branches' and all branches.
   */
  readonly groups: ReadonlyArray<IFilterListGroup<IBranchListItem>>

  /** The selected item in the filtered list */
  readonly selectedItem: IBranchListItem | null
}

function createState(
  defaultBranch: Branch | null,
  currentBranch: Branch | null,
  allBranches: ReadonlyArray<Branch>,
  recentBranches: ReadonlyArray<Branch>,
  selectedBranch: Branch | null
): IBranchListState {
  const groups = groupBranches(
    defaultBranch,
    currentBranch,
    allBranches,
    recentBranches
  )

  let selectedItem: IBranchListItem | null = null
  if (selectedBranch) {
    for (const group of groups) {
      selectedItem =
        group.items.find(i => {
          const branch = i.branch
          return branch.name === selectedBranch.name
        }) || null

      if (selectedItem) {
        break
      }
    }
  }

  return { groups, selectedItem }
}

/** The Branches list component. */
export class BranchList extends React.Component<
  IBranchListProps,
  IBranchListState
> {
  private branchFilterList: SectionFilterList<IBranchListItem> | null = null

  public constructor(props: IBranchListProps) {
    super(props)
    this.state = createState(
      props.defaultBranch,
      props.currentBranch,
      props.allBranches,
      props.recentBranches,
      props.selectedBranch
    )
  }

  public componentWillReceiveProps(nextProps: IBranchListProps) {
    this.setState(
      createState(
        nextProps.defaultBranch,
        nextProps.currentBranch,
        nextProps.allBranches,
        nextProps.recentBranches,
        nextProps.selectedBranch
      )
    )
  }

  public selectNextItem(focus: boolean = false, direction: SelectionDirection) {
    if (this.branchFilterList !== null) {
      this.branchFilterList.selectNextItem(focus, direction)
    }
  }

  public render() {
    return (
      <SectionFilterList<IBranchListItem>
        ref={this.onBranchesFilterListRef}
        className="branches-list"
        rowHeight={RowHeight}
        filterText={this.props.filterText}
        onFilterTextChanged={this.props.onFilterTextChanged}
        onFilterKeyDown={this.props.onFilterKeyDown}
        selectedItem={this.state.selectedItem}
        renderItem={this.renderItem}
        renderGroupHeader={this.renderGroupHeader}
        onItemClick={this.onItemClick}
        onSelectionChanged={this.onSelectionChanged}
        onEnterPressedWithoutFilteredItems={this.onCreateNewBranch}
        groups={this.state.groups}
        invalidationProps={this.props.allBranches}
        renderPostFilter={this.onRenderNewButton}
        renderNoItems={this.onRenderNoItems}
        filterTextBox={this.props.textbox}
        hideFilterRow={this.props.hideFilterRow}
        onFilterListResultsChanged={this.props.onFilterListResultsChanged}
        renderPreList={this.props.renderPreList}
        onItemContextMenu={this.onBranchContextMenu}
        getItemAriaLabel={this.getItemAriaLabel}
        getGroupAriaLabel={this.getGroupAriaLabel}
      />
    )
  }

  private onBranchContextMenu = (
    item: IBranchListItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()

    const { onRenameBranch, onDeleteBranch } = this.props
    if (onRenameBranch === undefined && onDeleteBranch === undefined) {
      return
    }

    const { type, name } = item.branch
    const isLocal = type === BranchType.Local
    const items = generateBranchContextMenuItems({
      name,
      isLocal,
      onRenameBranch,
      onDeleteBranch,
    })

    showContextualMenu(items)
  }

  private onBranchesFilterListRef = (
    filterList: SectionFilterList<IBranchListItem> | null
  ) => {
    this.branchFilterList = filterList
  }

  private renderItem = (item: IBranchListItem, matches: IMatches) => {
    return this.props.renderBranch(item, matches)
  }

  private parseHeader(label: string): BranchGroupIdentifier | null {
    switch (label) {
      case 'default':
      case 'recent':
      case 'other':
        return label
      default:
        return null
    }
  }

  private getItemAriaLabel = (item: IBranchListItem) => {
    return this.props.getBranchAriaLabel?.(item)
  }

  private getGroupAriaLabel = (group: number) => {
    const identifier = this.state.groups[group]
      .identifier as BranchGroupIdentifier
    return this.getGroupLabel(identifier)
  }

  private renderGroupHeader = (label: string) => {
    const identifier = this.parseHeader(label)

    return identifier !== null ? (
      <div className="branches-list-content filter-list-group-header">
        {this.getGroupLabel(identifier)}
      </div>
    ) : null
  }

  private getGroupLabel(identifier: BranchGroupIdentifier) {
    if (identifier === 'default') {
      return __DARWIN__ ? 'Default Branch' : 'Default branch'
    } else if (identifier === 'recent') {
      return __DARWIN__ ? 'Recent Branches' : 'Recent branches'
    } else if (identifier === 'other') {
      return __DARWIN__ ? 'Other Branches' : 'Other branches'
    } else {
      return assertNever(identifier, `Unknown identifier: ${identifier}`)
    }
  }

  private onRenderNoItems = () => {
    return (
      <NoBranches
        onCreateNewBranch={this.onCreateNewBranch}
        canCreateNewBranch={this.props.canCreateNewBranch}
        noBranchesMessage={this.props.noBranchesMessage}
      />
    )
  }

  private onRenderNewButton = () => {
    return this.props.canCreateNewBranch ? (
      <Button className="new-branch-button" onClick={this.onCreateNewBranch}>
        {__DARWIN__ ? 'New Branch' : 'New branch'}
      </Button>
    ) : null
  }

  private onItemClick = (item: IBranchListItem, source: ClickSource) => {
    if (this.props.onItemClick) {
      this.props.onItemClick(item.branch, source)
    }
  }

  private onSelectionChanged = (
    selectedItem: IBranchListItem | null,
    source: SelectionSource
  ) => {
    if (this.props.onSelectionChanged) {
      this.props.onSelectionChanged(
        selectedItem ? selectedItem.branch : null,
        source
      )
    }
  }

  private onCreateNewBranch = () => {
    if (this.props.onCreateNewBranch) {
      this.props.onCreateNewBranch(this.props.filterText)
    }
  }
}
