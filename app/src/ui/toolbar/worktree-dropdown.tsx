import * as React from 'react'
import * as Path from 'path'
import { Dispatcher } from '../dispatcher'
import * as octicons from '../octicons/octicons.generated'
import { Repository } from '../../models/repository'
import { ToolbarDropdown, DropdownState } from './dropdown'
import { FoldoutType, IConstrainedValue } from '../../lib/app-state'
import { WorktreeEntry } from '../../models/worktree'
import { WorktreeList } from '../worktrees/worktree-list'
import { showContextualMenu, IMenuItem } from '../../lib/menu-item'
import { generateWorktreeContextMenuItems } from '../worktrees/worktree-list-item-context-menu'
import { PopupType } from '../../models/popup'
import { Resizable } from '../resizable'
import { enableResizingToolbarButtons } from '../../lib/feature-flag'

interface IWorktreeDropdownProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly worktrees: ReadonlyArray<WorktreeEntry>
  readonly isOpen: boolean
  readonly onDropDownStateChanged: (state: DropdownState) => void
  readonly enableFocusTrap: boolean
  readonly worktreeDropdownWidth: IConstrainedValue
}

interface IWorktreeDropdownState {
  readonly filterText: string
}

export class WorktreeDropdown extends React.Component<
  IWorktreeDropdownProps,
  IWorktreeDropdownState
> {
  public constructor(props: IWorktreeDropdownProps) {
    super(props)
    this.state = {
      filterText: '',
    }
  }

  private onWorktreeClick = async (worktree: WorktreeEntry) => {
    const { dispatcher, repository } = this.props

    dispatcher.closeFoldout(FoldoutType.Worktree)
    await dispatcher.switchWorktree(repository, worktree)
  }

  private onWorktreeContextMenu = (
    worktree: WorktreeEntry,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()

    const items = generateWorktreeContextMenuItems({
      path: worktree.path,
      isMainWorktree: worktree.type === 'main',
      isLocked: worktree.isLocked,
      onRenameWorktree: this.onRenameWorktree,
      onRemoveWorktree: this.onRemoveWorktree,
    })

    showContextualMenu(items)
  }

  private onRenameWorktree = (path: string) => {
    this.props.dispatcher.closeFoldout(FoldoutType.Worktree)
    this.props.dispatcher.showPopup({
      type: PopupType.RenameWorktree,
      repository: this.props.repository,
      worktreePath: path,
    })
  }

  private onRemoveWorktree = (path: string) => {
    this.props.dispatcher.closeFoldout(FoldoutType.Worktree)
    this.props.dispatcher.requestDeleteWorktree(this.props.repository, path)
  }

  private onCreateNewWorktree = () => {
    this.props.dispatcher.closeFoldout(FoldoutType.Worktree)
    this.props.dispatcher.showPopup({
      type: PopupType.AddWorktree,
      repository: this.props.repository,
    })
  }

  private onContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()

    const currentWorktree = this.getCurrentWorktree()
    if (currentWorktree === null) {
      return
    }

    const isMain = currentWorktree.type === 'main'

    const items = generateWorktreeContextMenuItems({
      path: currentWorktree.path,
      isMainWorktree: isMain,
      isLocked: currentWorktree.isLocked,
      onRemoveWorktree: isMain ? undefined : this.onRemoveWorktree,
    })

    const newWorktreeItem: IMenuItem = {
      label: __DARWIN__ ? 'New Worktree…' : 'New worktree…',
      action: this.onCreateNewWorktree,
    }

    showContextualMenu([newWorktreeItem, { type: 'separator' }, ...items])
  }

  private onFilterTextChanged = (text: string) => {
    this.setState({ filterText: text })
  }

  private renderWorktreeFoldout = (): JSX.Element | null => {
    const { worktrees } = this.props

    return (
      <WorktreeList
        worktrees={worktrees}
        currentWorktree={this.getCurrentWorktree()}
        onWorktreeClick={this.onWorktreeClick}
        filterText={this.state.filterText}
        onFilterTextChanged={this.onFilterTextChanged}
        canCreateNewWorktree={true}
        onCreateNewWorktree={this.onCreateNewWorktree}
        onWorktreeContextMenu={this.onWorktreeContextMenu}
      />
    )
  }

  private getCurrentWorktree(): WorktreeEntry | null {
    const repoPath = this.props.repository.path
    return this.props.worktrees.find(wt => wt.path === repoPath) ?? null
  }

  private onResize = (width: number) => {
    this.props.dispatcher.setWorktreeDropdownWidth(width)
  }

  private onReset = () => {
    this.props.dispatcher.resetWorktreeDropdownWidth()
  }

  public render() {
    const { isOpen, enableFocusTrap } = this.props
    const currentState: DropdownState = isOpen ? 'open' : 'closed'
    const currentWorktree = this.getCurrentWorktree()
    const title = currentWorktree
      ? Path.basename(currentWorktree.path)
      : this.props.repository.name
    const description = __DARWIN__ ? 'Current Worktree' : 'Current worktree'

    const toolbarDropdown = (
      <ToolbarDropdown
        className="worktree-button"
        icon={octicons.fileDirectory}
        title={title}
        description={description}
        tooltip={isOpen ? undefined : `Current worktree is ${title}`}
        onDropdownStateChanged={this.props.onDropDownStateChanged}
        onContextMenu={this.onContextMenu}
        dropdownContentRenderer={this.renderWorktreeFoldout}
        dropdownState={currentState}
        showDisclosureArrow={true}
        enableFocusTrap={enableFocusTrap}
        foldoutStyleOverrides={
          enableResizingToolbarButtons()
            ? {
                width: this.props.worktreeDropdownWidth.value,
                maxWidth: this.props.worktreeDropdownWidth.max,
                minWidth: 365,
              }
            : undefined
        }
      />
    )

    if (!enableResizingToolbarButtons()) {
      return toolbarDropdown
    }

    return (
      <Resizable
        width={this.props.worktreeDropdownWidth.value}
        onReset={this.onReset}
        onResize={this.onResize}
        maximumWidth={this.props.worktreeDropdownWidth.max}
        minimumWidth={this.props.worktreeDropdownWidth.min}
        description="Current worktree dropdown button"
      >
        {toolbarDropdown}
      </Resizable>
    )
  }
}
