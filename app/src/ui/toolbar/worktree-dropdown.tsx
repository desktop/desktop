import * as React from 'react'
import * as Path from 'path'
import { Dispatcher } from '../dispatcher'
import * as octicons from '../octicons/octicons.generated'
import { Repository } from '../../models/repository'
import { ToolbarDropdown, DropdownState } from './dropdown'
import { FoldoutType, IConstrainedValue } from '../../lib/app-state'
import { WorktreeEntry } from '../../models/worktree'
import { WorktreeList } from '../worktrees/worktree-list'
import { listWorktrees } from '../../lib/git/worktree'
import { CloningRepository } from '../../models/cloning-repository'
import { showContextualMenu } from '../../lib/menu-item'
import { generateWorktreeContextMenuItems } from '../worktrees/worktree-list-item-context-menu'
import { PopupType } from '../../models/popup'
import { Resizable } from '../resizable'
import { enableResizingToolbarButtons } from '../../lib/feature-flag'

interface IWorktreeDropdownProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly isOpen: boolean
  readonly onDropDownStateChanged: (state: DropdownState) => void
  readonly enableFocusTrap: boolean
  readonly repositories: ReadonlyArray<Repository | CloningRepository>
  readonly worktreeDropdownWidth: IConstrainedValue
}

interface IWorktreeDropdownState {
  readonly worktrees: ReadonlyArray<WorktreeEntry>
  readonly filterText: string
  readonly worktreeAddedRepo: Repository | null
}

export class WorktreeDropdown extends React.Component<
  IWorktreeDropdownProps,
  IWorktreeDropdownState
> {
  public constructor(props: IWorktreeDropdownProps) {
    super(props)
    this.state = {
      worktrees: [],
      filterText: '',
      worktreeAddedRepo: null,
    }
  }

  public componentDidUpdate(prevProps: IWorktreeDropdownProps) {
    if (!prevProps.isOpen && this.props.isOpen) {
      this.fetchWorktrees()
    }
  }

  private async fetchWorktrees() {
    const { repository } = this.props

    try {
      const worktrees = await listWorktrees(repository)
      this.setState({ worktrees })
    } catch (e) {
      log.error('Failed to fetch worktrees', e)
      this.setState({ worktrees: [] })
    }
  }

  private onWorktreeClick = async (worktree: WorktreeEntry) => {
    const { dispatcher, repositories } = this.props
    const worktreePath = normalizePath(worktree.path)
    const previousWorktreeRepo = this.state.worktreeAddedRepo

    dispatcher.closeFoldout(FoldoutType.Worktree)

    const existingRepo = repositories.find(
      r => r instanceof Repository && normalizePath(r.path) === worktreePath
    )

    if (existingRepo && existingRepo instanceof Repository) {
      await dispatcher.selectRepository(existingRepo)
      this.setState({ worktreeAddedRepo: null })
    } else {
      const addedRepos = await dispatcher.addRepositories([worktree.path])

      if (addedRepos.length > 0) {
        await dispatcher.selectRepository(addedRepos[0])
        this.setState({ worktreeAddedRepo: addedRepos[0] })
      }
    }

    if (previousWorktreeRepo) {
      await dispatcher.removeRepository(previousWorktreeRepo, false)
      dispatcher.closeFoldout(FoldoutType.Repository)
    }
  }

  // Intentional no-op: navigation happens on click, not selection change
  private onWorktreeSelected = (_worktree: WorktreeEntry) => {}

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
    this.props.dispatcher.showPopup({
      type: PopupType.DeleteWorktree,
      repository: this.props.repository,
      worktreePath: path,
    })
  }

  private onCreateNewWorktree = () => {
    this.props.dispatcher.closeFoldout(FoldoutType.Worktree)
    this.props.dispatcher.showPopup({
      type: PopupType.AddWorktree,
      repository: this.props.repository,
    })
  }

  private onFilterTextChanged = (text: string) => {
    this.setState({ filterText: text })
  }

  private renderWorktreeFoldout = (): JSX.Element | null => {
    const { worktrees } = this.state

    return (
      <WorktreeList
        worktrees={worktrees}
        currentWorktree={this.getCurrentWorktree()}
        selectedWorktree={null}
        onWorktreeSelected={this.onWorktreeSelected}
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
    const repoPath = normalizePath(this.props.repository.path)
    return (
      this.state.worktrees.find(wt => normalizePath(wt.path) === repoPath) ??
      null
    )
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

function normalizePath(p: string): string {
  return p.replace(/\/+$/, '')
}
