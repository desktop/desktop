import * as React from 'react'
import * as Path from 'path'
import { WorktreeEntry } from '../../models/worktree'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { SectionFilterList } from '../lib/section-filter-list'
import { WorktreeListItem } from './worktree-list-item'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { IMatches } from '../../lib/fuzzy-find'
import { ClickSource } from '../lib/list'
import memoizeOne from 'memoize-one'

const RowHeight = 30

interface IWorktreeListItem extends IFilterListItem {
  readonly text: ReadonlyArray<string>
  readonly id: string
  readonly worktree: WorktreeEntry
}

interface IWorktreeListProps {
  readonly worktrees: ReadonlyArray<WorktreeEntry>
  readonly currentWorktree: WorktreeEntry | null
  readonly selectedWorktree: WorktreeEntry | null
  readonly onWorktreeSelected: (worktree: WorktreeEntry) => void
  readonly onWorktreeClick?: (
    worktree: WorktreeEntry,
    source: ClickSource
  ) => void
  readonly onFilterTextChanged: (text: string) => void
  readonly filterText: string
  readonly canCreateNewWorktree: boolean
  readonly onCreateNewWorktree?: () => void
  readonly onWorktreeContextMenu?: (
    worktree: WorktreeEntry,
    event: React.MouseEvent<HTMLDivElement>
  ) => void
}

type WorktreeGroupIdentifier = 'main' | 'linked'

export class WorktreeList extends React.Component<IWorktreeListProps> {
  private getGroups = memoizeOne((worktrees: ReadonlyArray<WorktreeEntry>) => {
    const groups: Array<
      IFilterListGroup<IWorktreeListItem, WorktreeGroupIdentifier>
    > = []

    const mainWorktree = worktrees.find(w => w.type === 'main')
    const linkedWorktrees = worktrees.filter(w => w.type === 'linked')

    if (mainWorktree) {
      groups.push({
        identifier: 'main',
        items: [
          {
            text: [Path.basename(mainWorktree.path)],
            id: mainWorktree.path,
            worktree: mainWorktree,
          },
        ],
      })
    }

    if (linkedWorktrees.length > 0) {
      groups.push({
        identifier: 'linked',
        items: linkedWorktrees.map(w => ({
          text: [Path.basename(w.path)],
          id: w.path,
          worktree: w,
        })),
      })
    }

    return groups
  })

  private renderItem = (item: IWorktreeListItem, matches: IMatches) => {
    return (
      <WorktreeListItem
        worktree={item.worktree}
        isCurrentWorktree={
          this.props.currentWorktree !== null &&
          this.props.currentWorktree.path === item.worktree.path
        }
        matches={matches}
      />
    )
  }

  private renderGroupHeader = (identifier: WorktreeGroupIdentifier) => {
    const label = identifier === 'main' ? 'Main Worktree' : 'Linked Worktrees'
    return <div className="filter-list-group-header">{label}</div>
  }

  private onRenderNewButton = () => {
    if (!this.props.canCreateNewWorktree || !this.props.onCreateNewWorktree) {
      return null
    }
    return (
      <Button
        className="new-worktree-button"
        onClick={this.props.onCreateNewWorktree}
      >
        <Octicon symbol={octicons.plus} className="mr" />
        {__DARWIN__ ? 'New Worktree' : 'New worktree'}
      </Button>
    )
  }

  private onRenderNoItems = () => {
    return <div className="no-items-found">No worktrees found</div>
  }

  private onItemClick = (item: IWorktreeListItem, source: ClickSource) => {
    if (this.props.onWorktreeClick) {
      this.props.onWorktreeClick(item.worktree, source)
    }
  }

  private onSelectionChanged = (item: IWorktreeListItem | null) => {
    if (item) {
      this.props.onWorktreeSelected(item.worktree)
    }
  }

  private onItemContextMenu = (
    item: IWorktreeListItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (this.props.onWorktreeContextMenu) {
      this.props.onWorktreeContextMenu(item.worktree, event)
    }
  }

  public render() {
    const groups = this.getGroups(this.props.worktrees)
    const selectedItem =
      groups
        .flatMap(g => g.items)
        .find(i => i.worktree.path === this.props.selectedWorktree?.path) ||
      null

    return (
      <SectionFilterList<IWorktreeListItem, WorktreeGroupIdentifier>
        className="worktree-list"
        rowHeight={RowHeight}
        filterText={this.props.filterText}
        onFilterTextChanged={this.props.onFilterTextChanged}
        selectedItem={selectedItem}
        renderItem={this.renderItem}
        renderGroupHeader={this.renderGroupHeader}
        onItemClick={this.onItemClick}
        onSelectionChanged={this.onSelectionChanged}
        groups={groups}
        invalidationProps={this.props.worktrees}
        renderPostFilter={this.onRenderNewButton}
        renderNoItems={this.onRenderNoItems}
        onItemContextMenu={this.onItemContextMenu}
      />
    )
  }
}
