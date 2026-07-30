import * as React from 'react'
import * as Path from 'path'

import { Dispatcher } from '../dispatcher'
import { IMenuItem } from '../../lib/menu-item'
import { revealInFileManager } from '../../lib/app-shell'
import { encodePathAsUrl } from '../../lib/path'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  AppFileStatus,
  AppFileStatusKind,
} from '../../models/status'
import { DiffSelectionType, WorkingDirectoryDiffKind } from '../../models/diff'
import { CommitIdentity } from '../../models/commit-identity'
import { ICommitMessage } from '../../models/commit-message'
import {
  isRepositoryWithGitHubRepository,
  Repository,
} from '../../models/repository'
import { Account } from '../../models/account'
import { Author, UnknownAuthor } from '../../models/author'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { CommitOptions, IFileListFilterState } from '../../lib/app-state'
import {
  isSafeFileExtension,
  DefaultEditorLabel,
  CopyFilePathLabel,
  RevealInFileManagerLabel,
  OpenWithDefaultProgramLabel,
  CopyRelativeFilePathLabel,
  CopySelectedPathsLabel,
  CopySelectedRelativePathsLabel,
} from '../lib/context-menu'
import { CommitMessage } from './commit-message'
import { ChangedFile } from './changed-file'
import { IAutocompletionProvider } from '../autocompletion'
import { showContextualMenu } from '../../lib/menu-item'
import { arrayEquals } from '../../lib/equality'
import { clipboard } from 'electron'
import { basename } from 'path'
import { Commit, ICommitContext } from '../../models/commit'
import { SubmoduleEntry } from '../../models/submodule'
import {
  RebaseConflictState,
  ConflictState,
  Foldout,
} from '../../lib/app-state'
import { ContinueRebase } from './continue-rebase'
import { Octicon, OcticonSymbolVariant } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { IStashEntry } from '../../models/stash-entry'
import classNames from 'classnames'
import { hasWritePermission } from '../../models/github-repository'
import { hasConflictedFiles, hasUnresolvedConflicts } from '../../lib/status'
import { createObservableRef } from '../lib/observable-ref'
import { Popup, PopupType } from '../../models/popup'
import { EOL } from 'os'
import { RepoRulesInfo } from '../../models/repo-rules'
import { IAheadBehind } from '../../models/branch'
import { StashDiffViewerId } from '../stashing'
import { AugmentedSectionFilterList } from '../lib/augmented-filter-list'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { ClickSource } from '../lib/list'
import memoizeOne from 'memoize-one'
import { IMatches, match } from '../../lib/fuzzy-find'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { plural } from '../lib/plural'
import {
  isCommittingFileHiddenByFilter,
  getNoResultsMessage,
  hasActiveFilters,
  applyFilters,
} from './filter-changes-logic'
import { ChangesListFilterOptions } from './changes-list-filter-options'
import { HookProgress } from '../../lib/git'
import { formatNumber } from '../../lib/format-number'
import { SubmodulesList } from './submodules-list'

export interface IChangesListItem extends IFilterListItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
  readonly change: WorkingDirectoryFileChange
  readonly status?: AppFileStatus
  readonly section?: ChangeFileListSection
}

const RowHeight = 29
const ClassicChangeListGroupIdentifier = 'changed-files'
const ChangeFileListItemSeparator = '\0'
const DefaultTreeSplitRatio = 0.5
const MinTreeSplitRatio = 0.2
const MaxTreeSplitRatio = 0.8

enum ChangesListViewMode {
  Classic = 'classic',
  Tree = 'tree',
  Submodules = 'submodules',
}

export enum ChangeFileListSection {
  Staged = 'staged',
  Unstaged = 'unstaged',
}

export type ChangesListScrollKind =
  | 'classic'
  | ChangeFileListSection.Staged
  | ChangeFileListSection.Unstaged

const ChangeFileListSectionLabels: Record<ChangeFileListSection, string> = {
  [ChangeFileListSection.Staged]: 'Staged files',
  [ChangeFileListSection.Unstaged]: 'Unstaged files',
}

const ChangeFileListSectionOrder: ReadonlyArray<ChangeFileListSection> = [
  ChangeFileListSection.Staged,
  ChangeFileListSection.Unstaged,
]

function getChangeFileListSections(
  file: WorkingDirectoryFileChange
): ReadonlyArray<ChangeFileListSection> {
  const sections = new Array<ChangeFileListSection>()

  if (file.hasStagedChanges) {
    sections.push(ChangeFileListSection.Staged)
  }

  if (file.hasUnstagedChanges) {
    sections.push(ChangeFileListSection.Unstaged)
  }

  return sections
}

function getChangeFileListItemId(
  file: WorkingDirectoryFileChange,
  section: ChangeFileListSection
): string {
  return `${file.id}${ChangeFileListItemSeparator}${section}`
}

function createClassicChangeFileListItem(
  file: WorkingDirectoryFileChange
): IChangesListItem {
  return {
    text: [file.path, file.status.kind.toString()],
    id: file.id,
    change: file,
    status: file.status,
  }
}

function createChangeFileListItem(
  file: WorkingDirectoryFileChange,
  section: ChangeFileListSection
): IChangesListItem {
  const status =
    section === ChangeFileListSection.Staged
      ? file.stagedStatus
      : file.unstagedStatus

  if (status === null) {
    throw new Error(`Missing ${section} status for ${file.path}`)
  }

  return {
    text: [
      file.path,
      status.kind.toString(),
      ChangeFileListSectionLabels[section],
    ],
    id: getChangeFileListItemId(file, section),
    change: file,
    status,
    section,
  }
}

function compareChangeFiles(
  first: WorkingDirectoryFileChange,
  second: WorkingDirectoryFileChange
): number {
  return first.path.localeCompare(second.path)
}

function getUniqueChangesFromItems(
  items: ReadonlyArray<IChangesListItem>
): ReadonlyArray<WorkingDirectoryFileChange> {
  const filesById = new Map<string, WorkingDirectoryFileChange>()

  for (const item of items) {
    filesById.set(item.change.id, item.change)
  }

  return Array.from(filesById.values())
}

function createFilteredItemsMap(
  items: ReadonlyArray<IChangesListItem>
): Map<string, IChangesListItem> {
  const filteredItems = new Map<string, IChangesListItem>()
  items.forEach(item => filteredItems.set(item.id, item))
  return filteredItems
}

function createFilteredItemsMapFromGroups(
  groups: ReadonlyArray<IFilterListGroup<IChangesListItem>>,
  filterText: string = '',
  filterMethod?: (item: IChangesListItem) => boolean
): Map<string, IChangesListItem> {
  const filter = filterText.toLowerCase()
  const items = groups.flatMap(group => {
    const itemsToMatch =
      filterMethod !== undefined
        ? group.items.filter(filterMethod)
        : group.items

    return filter.length > 0
      ? match(filter, itemsToMatch, item => item.text).map(
          result => result.item
        )
      : itemsToMatch
  })

  return createFilteredItemsMap(items)
}

function clampTreeSplitRatio(ratio: number) {
  return Math.min(MaxTreeSplitRatio, Math.max(MinTreeSplitRatio, ratio))
}

const StashIcon: OcticonSymbolVariant = {
  w: 16,
  h: 16,
  p: [
    'M10.5 1.286h-9a.214.214 0 0 0-.214.214v9a.214.214 0 0 0 .214.214h9a.214.214 0 0 0 ' +
      '.214-.214v-9a.214.214 0 0 0-.214-.214zM1.5 0h9A1.5 1.5 0 0 1 12 1.5v9a1.5 1.5 0 0 1-1.5 ' +
      '1.5h-9A1.5 1.5 0 0 1 0 10.5v-9A1.5 1.5 0 0 1 1.5 0zm5.712 7.212a1.714 1.714 0 1 ' +
      '1-2.424-2.424 1.714 1.714 0 0 1 2.424 2.424zM2.015 12.71c.102.729.728 1.29 1.485 ' +
      '1.29h9a1.5 1.5 0 0 0 1.5-1.5v-9a1.5 1.5 0 0 0-1.29-1.485v1.442a.216.216 0 0 1 ' +
      '.004.043v9a.214.214 0 0 1-.214.214h-9a.216.216 0 0 1-.043-.004H2.015zm2 2c.102.729.728 ' +
      '1.29 1.485 1.29h9a1.5 1.5 0 0 0 1.5-1.5v-9a1.5 1.5 0 0 0-1.29-1.485v1.442a.216.216 0 0 1 ' +
      '.004.043v9a.214.214 0 0 1-.214.214h-9a.216.216 0 0 1-.043-.004H4.015z',
  ],
}

const GitIgnoreFileName = '.gitignore'

interface IFilterChangesListProps {
  readonly repository: Repository
  readonly repositoryAccount: Account | null
  readonly workingDirectory: WorkingDirectoryStatus
  readonly submodules: ReadonlyArray<SubmoduleEntry>
  readonly isUsingStagingWorkflow: boolean
  readonly mostRecentLocalCommit: Commit | null
  /**
   * An object containing the conflicts in the working directory.
   * When null it means that there are no conflicts.
   */
  readonly conflictState: ConflictState | null
  readonly rebaseConflictState: RebaseConflictState | null
  readonly selectedFileIDs: ReadonlyArray<string>
  readonly onFileSelectionChanged: (
    rows: ReadonlyArray<number>,
    diffKind: WorkingDirectoryDiffKind
  ) => void
  readonly onIncludeChanged: (
    file:
      | WorkingDirectoryFileChange
      | ReadonlyArray<WorkingDirectoryFileChange>,
    include: boolean
  ) => void
  readonly onCreateCommit: (context: ICommitContext) => Promise<boolean>
  readonly onDiscardChanges: (file: WorkingDirectoryFileChange) => void
  readonly askForConfirmationOnDiscardChanges: boolean
  readonly askForConfirmationOnCommitFilteredChanges: boolean
  readonly focusCommitMessage: boolean
  readonly isShowingModal: boolean
  readonly isShowingFoldout: boolean
  readonly onDiscardChangesFromFiles: (
    files: ReadonlyArray<WorkingDirectoryFileChange>,
    isDiscardingAllChanges: boolean
  ) => void

  /** Callback that fires on page scroll to pass the new scrollTop location */
  readonly onChangesListScrolled: (
    scrollTop: number,
    kind: ChangesListScrollKind
  ) => void

  /* The scrollTop of the compareList. It is stored to allow for scroll position persistence */
  readonly changesListScrollTop?: number
  readonly stagedChangesListScrollTop?: number
  readonly unstagedChangesListScrollTop?: number

  /**
   * Called to open a file in its default application
   *
   * @param path The path of the file relative to the root of the repository
   */
  readonly onOpenItem: (path: string) => void

  readonly onOpenSubmodule: (fullPath: string) => void

  /**
   * Called to open a file in the default external editor
   *
   * @param path The path of the file relative to the root of the repository
   */
  readonly onOpenItemInExternalEditor: (path: string) => void

  /**
   * The currently checked out branch (null if no branch is checked out).
   */
  readonly branch: string | null
  readonly commitAuthor: CommitIdentity | null
  readonly dispatcher: Dispatcher
  readonly availableWidth: number
  readonly isCommitting: boolean
  readonly hookProgress: HookProgress | null
  readonly onShowCommitProgress?: (() => void) | undefined
  readonly isGeneratingCommitMessage: boolean
  readonly shouldShowGenerateCommitMessageCallOut: boolean
  readonly commitToAmend: Commit | null
  readonly currentBranchProtected: boolean
  readonly currentRepoRulesInfo: RepoRulesInfo
  readonly aheadBehind: IAheadBehind | null

  /**
   * Click event handler passed directly to the onRowClick prop of List, see
   * List Props for documentation.
   */
  readonly onRowClick?: (row: number, source: ClickSource) => void
  readonly commitMessage: ICommitMessage

  /** The autocompletion providers available to the repository. */
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>

  /** Called when the given file should be ignored. */
  readonly onIgnoreFile: (pattern: string | string[]) => void

  /** Called when the given pattern should be ignored. */
  readonly onIgnorePattern: (pattern: string | string[]) => void

  /**
   * Whether or not to show a field for adding co-authors to
   * a commit (currently only supported for GH/GHE repositories)
   */
  readonly showCoAuthoredBy: boolean

  /**
   * A list of authors (name, email pairs) which have been
   * entered into the co-authors input box in the commit form
   * and which _may_ be used in the subsequent commit to add
   * Co-Authored-By commit message trailers depending on whether
   * the user has chosen to do so.
   */
  readonly coAuthors: ReadonlyArray<Author>

  /** The name of the currently selected external editor */
  readonly externalEditorLabel?: string

  readonly stashEntry: IStashEntry | null

  readonly isShowingStashEntry: boolean

  /**
   * Whether we should show the onboarding tutorial nudge
   * arrow pointing at the commit summary box
   */
  readonly shouldNudgeToCommit: boolean

  readonly commitSpellcheckEnabled: boolean

  readonly showCommitLengthWarning: boolean

  readonly accounts: ReadonlyArray<Account>

  /** The file list filter state containing all filter options */
  readonly fileListFilter: IFileListFilterState

  /** Whether or not to show the changes filter */
  readonly showChangesFilter: boolean

  /**
   * Whether or not to skip blocking commit hooks when creating commits
   * by means of passing the `--no-verify` flag to git commit
   */
  readonly skipCommitHooks: boolean

  /**
   * Whether or not to add a `Signed-off-by` trailer to commit messages
   * by means of passing the `--signoff` flag to git commit
   */
  readonly signOffCommits: boolean

  /**
   * Whether or not to allow creating a commit without any file changes
   * by means of passing the `--allow-empty` flag to git commit.
   * This option resets to false after each commit.
   */
  readonly allowEmptyCommit: boolean

  /** Callback to set commit options for the given repository */
  readonly onUpdateCommitOptions: (
    repository: Repository,
    options: Partial<CommitOptions>
  ) => void
}

interface IFilterChangesListState {
  readonly filteredItems: Map<string, IChangesListItem>
  readonly selectedItems: ReadonlyArray<IChangesListItem>
  readonly focusedRow: string | null
  readonly groups: ReadonlyArray<IFilterListGroup<IChangesListItem>>
  readonly viewMode: ChangesListViewMode
  readonly treeSplitRatio: number
  readonly isChangingStagingWorkflow: boolean
  readonly isChangingStagedFiles: boolean
}

function getSelectedItemsFromProps(
  props: IFilterChangesListProps,
  previousSelectedItems: ReadonlyArray<IChangesListItem> = [],
  viewMode: ChangesListViewMode = ChangesListViewMode.Tree
): ReadonlyArray<IChangesListItem> {
  if (props.selectedFileIDs.length === 0) {
    return []
  }

  const selectedItems = []
  for (let i = 0; i < props.selectedFileIDs.length; i++) {
    const fid = props.selectedFileIDs[i]
    const file = props.workingDirectory.findFileWithID(fid)
    if (file === null) {
      continue
    }

    if (viewMode === ChangesListViewMode.Classic) {
      selectedItems.push(createClassicChangeFileListItem(file))
      continue
    }

    const items = getChangeFileListSections(file).map(section =>
      createChangeFileListItem(file, section)
    )
    const previousItemIds = new Set(
      previousSelectedItems
        .filter(item => item.change.id === file.id)
        .map(item => item.id)
    )
    const preservedItems = items.filter(item => previousItemIds.has(item.id))

    if (preservedItems.length > 0) {
      selectedItems.push(...preservedItems)
    } else if (items.length > 0) {
      selectedItems.push(items[0])
    }
  }

  return selectedItems
}

/** Get checkbox value from includeAll status */
function getCheckBoxValueFromIncludeAll(
  includeAll: boolean | null
): CheckboxValue {
  if (includeAll === true) {
    return CheckboxValue.On
  }

  if (includeAll === false) {
    return CheckboxValue.Off
  }

  return CheckboxValue.Mixed
}

export class FilterChangesList extends React.Component<
  IFilterChangesListProps,
  IFilterChangesListState
> {
  private lastSelectedItems: ReadonlyArray<IChangesListItem> = []
  private filterTextBox: TextBox | undefined = undefined
  private headerRef = createObservableRef<HTMLDivElement>()
  private splitViewRef = React.createRef<HTMLDivElement>()
  private filterOptionsButtonRef: HTMLButtonElement | null = null
  private includeAllCheckBoxRef = React.createRef<Checkbox>()
  private filterListRef =
    React.createRef<AugmentedSectionFilterList<IChangesListItem>>()
  private stagedFilterListRef =
    React.createRef<AugmentedSectionFilterList<IChangesListItem>>()
  private unstagedFilterListRef =
    React.createRef<AugmentedSectionFilterList<IChangesListItem>>()
  private stagedScrollTop = 0
  private unstagedScrollTop = 0
  private isMounted = false

  /** Compute the 'Include All' checkbox value */
  private getCheckAllValue = memoizeOne(
    (
      workingDirectory: WorkingDirectoryStatus,
      rebaseConflictState: RebaseConflictState | null,
      filteredItems: Map<string, IChangesListItem>
    ): CheckboxValue => {
      const files = getUniqueChangesFromItems(
        Array.from(filteredItems.values())
      )

      if (
        files.length === workingDirectory.files.length &&
        rebaseConflictState === null
      ) {
        return getCheckBoxValueFromIncludeAll(workingDirectory.includeAll)
      }

      if (files.length === 0) {
        // the current commit will be skipped in the rebase
        return CheckboxValue.Off
      }

      if (rebaseConflictState !== null) {
        // untracked files will be skipped by the rebase, so we need to ensure that
        // the "Include All" checkbox matches this state
        const onlyUntrackedFilesFound = files.every(
          f => f.status.kind === AppFileStatusKind.Untracked
        )

        if (onlyUntrackedFilesFound) {
          return CheckboxValue.Off
        }

        const onlyTrackedFilesFound = files.every(
          f => f.status.kind !== AppFileStatusKind.Untracked
        )

        // show "Mixed" if we have a mixture of tracked and untracked changes
        return onlyTrackedFilesFound ? CheckboxValue.On : CheckboxValue.Mixed
      }

      const filteredStatus = WorkingDirectoryStatus.fromFiles(files)

      return getCheckBoxValueFromIncludeAll(filteredStatus.includeAll)
    }
  )

  public constructor(props: IFilterChangesListProps) {
    super(props)

    const viewMode = props.isUsingStagingWorkflow
      ? ChangesListViewMode.Tree
      : ChangesListViewMode.Classic
    const groups = this.createListGroups(props.workingDirectory.files, viewMode)
    const selectedItems = getSelectedItemsFromProps(props, [], viewMode)
    this.lastSelectedItems = selectedItems
    this.stagedScrollTop = props.stagedChangesListScrollTop ?? 0
    this.unstagedScrollTop = props.unstagedChangesListScrollTop ?? 0

    this.state = {
      filteredItems: this.createFilteredItemsMapForGroups(groups, props),
      selectedItems,
      focusedRow: null,
      groups,
      viewMode,
      treeSplitRatio: DefaultTreeSplitRatio,
      isChangingStagingWorkflow: false,
      isChangingStagedFiles: false,
    }
  }

  public componentDidMount() {
    this.isMounted = true
    this.notifyFileSelectionChanged(this.state.selectedItems)
  }

  private createFilteredItemsMapForGroups(
    groups: ReadonlyArray<IFilterListGroup<IChangesListItem>>,
    props: IFilterChangesListProps = this.props
  ) {
    const filterText = props.showChangesFilter
      ? props.fileListFilter.filterText
      : ''
    const filterMethod =
      props.fileListFilter.isIncludedInCommit ||
      props.fileListFilter.isNewFile ||
      props.fileListFilter.isModifiedFile ||
      props.fileListFilter.isDeletedFile ||
      props.fileListFilter.isExcludedFromCommit
        ? (item: IChangesListItem) =>
            applyFilters(item, props.showChangesFilter, props.fileListFilter)
        : undefined

    return createFilteredItemsMapFromGroups(groups, filterText, filterMethod)
  }

  public componentWillUnmount() {
    this.isMounted = false
    this.stopTreeSectionResize()
  }

  public componentWillReceiveProps(nextProps: IFilterChangesListProps) {
    if (nextProps.repository.id !== this.props.repository.id) {
      this.stagedScrollTop = nextProps.stagedChangesListScrollTop ?? 0
      this.unstagedScrollTop = nextProps.unstagedChangesListScrollTop ?? 0
    } else {
      if (
        nextProps.stagedChangesListScrollTop !== undefined &&
        nextProps.stagedChangesListScrollTop !==
          this.props.stagedChangesListScrollTop
      ) {
        this.stagedScrollTop = nextProps.stagedChangesListScrollTop
      }

      if (
        nextProps.unstagedChangesListScrollTop !== undefined &&
        nextProps.unstagedChangesListScrollTop !==
          this.props.unstagedChangesListScrollTop
      ) {
        this.unstagedScrollTop = nextProps.unstagedChangesListScrollTop
      }
    }

    const nextLayoutMode = nextProps.isUsingStagingWorkflow
      ? ChangesListViewMode.Tree
      : ChangesListViewMode.Classic
    const layoutModeChanged =
      nextProps.isUsingStagingWorkflow !== this.props.isUsingStagingWorkflow
    const nextViewMode =
      layoutModeChanged &&
      this.state.viewMode !== ChangesListViewMode.Submodules
        ? nextLayoutMode
        : this.state.viewMode
    const listChanged =
      layoutModeChanged ||
      !arrayEquals(nextProps.selectedFileIDs, this.props.selectedFileIDs) ||
      !arrayEquals(nextProps.submodules, this.props.submodules) ||
      !arrayEquals(
        nextProps.workingDirectory.files,
        this.props.workingDirectory.files
      )
    const filterChanged =
      nextProps.showChangesFilter !== this.props.showChangesFilter ||
      nextProps.fileListFilter !== this.props.fileListFilter

    if (listChanged || filterChanged) {
      const selectedItems = listChanged
        ? getSelectedItemsFromProps(
            nextProps,
            this.lastSelectedItems,
            nextViewMode
          )
        : this.state.selectedItems
      const groups = listChanged
        ? this.createListGroups(nextProps.workingDirectory.files, nextViewMode)
        : this.state.groups

      if (listChanged) {
        this.lastSelectedItems = selectedItems
      }

      this.setState({
        selectedItems,
        groups,
        filteredItems: this.createFilteredItemsMapForGroups(groups, nextProps),
        viewMode: nextViewMode,
      })
    }
  }

  private createListGroups(
    files: ReadonlyArray<WorkingDirectoryFileChange>,
    viewMode: ChangesListViewMode
  ): ReadonlyArray<IFilterListGroup<IChangesListItem>> {
    if (viewMode === ChangesListViewMode.Classic) {
      return [
        {
          identifier: ClassicChangeListGroupIdentifier,
          showHeader: false,
          items: files.map(createClassicChangeFileListItem),
        },
      ]
    }

    const groups = new Map<ChangeFileListSection, IChangesListItem[]>()

    ChangeFileListSectionOrder.forEach(section => groups.set(section, []))

    for (const file of [...files].sort(compareChangeFiles)) {
      for (const section of getChangeFileListSections(file)) {
        const groupItems = groups.get(section)

        if (groupItems === undefined) {
          continue
        }

        groupItems.push(createChangeFileListItem(file, section))
      }
    }

    return Array.from(groups, ([identifier, items]) => ({
      identifier,
      showHeader: false,
      items,
    }))
  }

  private getUniqueChanges(
    items: ReadonlyArray<IChangesListItem>
  ): ReadonlyArray<WorkingDirectoryFileChange> {
    return getUniqueChangesFromItems(items)
  }

  private getUniqueFilteredChanges(): ReadonlyArray<WorkingDirectoryFileChange> {
    return this.getUniqueChanges(Array.from(this.state.filteredItems.values()))
  }

  private getSectionGroup(section: ChangeFileListSection) {
    return this.state.groups.find(g => g.identifier === section)
  }

  private getSectionChanges(
    section: ChangeFileListSection,
    filtered: boolean = false
  ): ReadonlyArray<WorkingDirectoryFileChange> {
    const group = this.getSectionGroup(section)

    if (group === undefined) {
      return []
    }

    const items = filtered
      ? group.items.filter(item => this.state.filteredItems.has(item.id))
      : group.items

    return this.getUniqueChanges(items)
  }

  private canStageFile(file: WorkingDirectoryFileChange): boolean {
    const status = file.unstagedStatus ?? file.status
    const { submoduleStatus } = status
    const isUncommittableSubmodule =
      submoduleStatus !== undefined &&
      status.kind === AppFileStatusKind.Modified &&
      !submoduleStatus.commitChanged

    return (
      !isUncommittableSubmodule &&
      !(
        status.kind === AppFileStatusKind.Conflicted &&
        hasUnresolvedConflicts(status)
      )
    )
  }

  private onChangesViewModeChanged = async (viewMode: ChangesListViewMode) => {
    if (
      viewMode === this.state.viewMode ||
      this.state.isChangingStagingWorkflow ||
      this.state.isChangingStagedFiles
    ) {
      return
    }

    if (
      viewMode === ChangesListViewMode.Classic &&
      this.props.workingDirectory.files.some(
        file => file.hasStagedChanges && file.hasUnstagedChanges
      )
    ) {
      return
    }

    if (viewMode !== ChangesListViewMode.Submodules) {
      this.setState({ isChangingStagingWorkflow: true })
      const changed = await this.props.dispatcher.setChangesStagingWorkflow(
        this.props.repository,
        viewMode === ChangesListViewMode.Tree
      )

      if (!this.isMounted) {
        return
      }

      this.setState({ isChangingStagingWorkflow: false })

      if (!changed) {
        return
      }
    }

    const groups = this.createListGroups(
      this.props.workingDirectory.files,
      viewMode
    )
    const selectedItems = getSelectedItemsFromProps(
      this.props,
      this.lastSelectedItems,
      viewMode
    )

    this.lastSelectedItems = selectedItems

    this.setState({
      viewMode,
      groups,
      selectedItems,
      filteredItems: this.createFilteredItemsMapForGroups(groups),
    })

    if (viewMode !== ChangesListViewMode.Submodules) {
      this.notifyFileSelectionChanged(
        selectedItems,
        viewMode === ChangesListViewMode.Classic
          ? WorkingDirectoryDiffKind.Combined
          : undefined
      )
    }
  }

  private onClassicViewModeClick = () => {
    this.onChangesViewModeChanged(ChangesListViewMode.Classic)
  }

  private onTreeViewModeClick = () => {
    this.onChangesViewModeChanged(ChangesListViewMode.Tree)
  }

  private onSubmodulesViewModeClick = () => {
    this.onChangesViewModeChanged(
      this.state.viewMode === ChangesListViewMode.Submodules
        ? this.props.isUsingStagingWorkflow
          ? ChangesListViewMode.Tree
          : ChangesListViewMode.Classic
        : ChangesListViewMode.Submodules
    )
  }

  private onTreeSectionResizeMouseDown = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault()
    window.addEventListener('mousemove', this.onTreeSectionResizeMouseMove)
    window.addEventListener('mouseup', this.onTreeSectionResizeMouseUp)
  }

  private onTreeSectionResizeMouseMove = (event: MouseEvent) => {
    const splitView = this.splitViewRef.current

    if (splitView === null) {
      return
    }

    const rect = splitView.getBoundingClientRect()

    if (rect.height === 0) {
      return
    }

    this.setState({
      treeSplitRatio: clampTreeSplitRatio(
        (event.clientY - rect.top) / rect.height
      ),
    })
  }

  private onTreeSectionResizeMouseUp = () => {
    this.stopTreeSectionResize()
  }

  private stopTreeSectionResize() {
    window.removeEventListener('mousemove', this.onTreeSectionResizeMouseMove)
    window.removeEventListener('mouseup', this.onTreeSectionResizeMouseUp)
  }

  private onTreeSectionResizeKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => {
    let treeSplitRatio: number | null = null

    if (event.key === 'ArrowUp') {
      treeSplitRatio = this.state.treeSplitRatio - 0.05
    } else if (event.key === 'ArrowDown') {
      treeSplitRatio = this.state.treeSplitRatio + 0.05
    } else if (event.key === 'Home') {
      treeSplitRatio = MinTreeSplitRatio
    } else if (event.key === 'End') {
      treeSplitRatio = MaxTreeSplitRatio
    }

    if (treeSplitRatio === null) {
      return
    }

    event.preventDefault()
    this.setState({ treeSplitRatio: clampTreeSplitRatio(treeSplitRatio) })
  }

  private onSectionIncludeChanged = (
    section: ChangeFileListSection,
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const include = event.currentTarget.checked
    const files = this.getSectionChanges(section, true).filter(
      file => !include || this.canStageFile(file)
    )

    if (files.length > 0) {
      this.changeFileStaged(files, include)
    }
  }

  private onStagedSectionIncludeChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.onSectionIncludeChanged(ChangeFileListSection.Staged, event)
  }

  private onUnstagedSectionIncludeChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.onSectionIncludeChanged(ChangeFileListSection.Unstaged, event)
  }

  private getSectionCheckboxValue(
    section: ChangeFileListSection,
    fileCount: number
  ): CheckboxValue {
    if (fileCount === 0) {
      return CheckboxValue.Off
    }

    return section === ChangeFileListSection.Staged
      ? CheckboxValue.On
      : CheckboxValue.Off
  }

  private renderSectionHeader = (section: ChangeFileListSection) => {
    const files = this.getSectionChanges(section, true)
    const fileCount = files.length
    const actionableFileCount =
      section === ChangeFileListSection.Staged
        ? fileCount
        : files.filter(file => this.canStageFile(file)).length
    const disabled =
      actionableFileCount === 0 ||
      this.props.isCommitting ||
      this.state.isChangingStagedFiles ||
      this.props.rebaseConflictState !== null
    const labelId = `changes-file-section-${section}-label`
    const onChange =
      section === ChangeFileListSection.Staged
        ? this.onStagedSectionIncludeChanged
        : this.onUnstagedSectionIncludeChanged

    return (
      <div className="changes-file-section-header">
        <Checkbox
          value={this.getSectionCheckboxValue(section, fileCount)}
          onChange={onChange}
          disabled={disabled}
          ariaLabelledBy={labelId}
        />
        <span id={labelId} className="changes-file-section-label">
          {ChangeFileListSectionLabels[section]}
        </span>
        <span className="changes-file-section-count">
          {formatNumber(fileCount)}
        </span>
      </div>
    )
  }

  private onIncludeAllChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const include = event.currentTarget.checked
    const filteredItemPaths = this.getUniqueFilteredChanges()

    if (this.props.isUsingStagingWorkflow) {
      const files = filteredItemPaths.filter(
        file => !include || this.canStageFile(file)
      )
      if (files.length > 0) {
        this.changeFileStaged(files, include)
      }
    } else {
      this.props.onIncludeChanged(filteredItemPaths, include)
    }
  }

  private onTreeFileStageChanged = (
    file: WorkingDirectoryFileChange,
    staged: boolean
  ) => {
    this.changeFileStaged(file, staged)
  }

  private changeFileStaged = async (
    files:
      | WorkingDirectoryFileChange
      | ReadonlyArray<WorkingDirectoryFileChange>,
    staged: boolean
  ) => {
    if (this.state.isChangingStagedFiles) {
      return
    }

    this.setState({ isChangingStagedFiles: true })
    try {
      await this.props.dispatcher.changeFileStaged(
        this.props.repository,
        files,
        staged
      )
    } finally {
      if (this.isMounted) {
        this.setState({ isChangingStagedFiles: false })
      }
    }
  }

  private renderChangedFile = (
    changeListItem: IChangesListItem,
    matches: IMatches
  ): JSX.Element | null => {
    const {
      rebaseConflictState,
      isCommitting,
      onIncludeChanged,
      availableWidth,
    } = this.props

    const file = changeListItem.change
    const selection = file.selection.getSelectionType()
    const status = changeListItem.status ?? file.status
    const { submoduleStatus } = status

    const isUncommittableSubmodule =
      submoduleStatus !== undefined &&
      status.kind === AppFileStatusKind.Modified &&
      !submoduleStatus.commitChanged

    const isPartiallyCommittableSubmodule =
      submoduleStatus !== undefined &&
      (submoduleStatus.commitChanged ||
        status.kind === AppFileStatusKind.New) &&
      (submoduleStatus.modifiedChanges || submoduleStatus.untrackedChanges)

    const includeAll =
      selection === DiffSelectionType.All
        ? true
        : selection === DiffSelectionType.None
        ? false
        : null

    const baseInclude = isUncommittableSubmodule
      ? false
      : rebaseConflictState !== null
      ? file.status.kind !== AppFileStatusKind.Untracked
      : includeAll

    const include =
      changeListItem.section === undefined
        ? baseInclude
        : changeListItem.section === ChangeFileListSection.Staged

    const hasUnresolvedConflict =
      file.status.kind === AppFileStatusKind.Conflicted &&
      hasUnresolvedConflicts(file.status)

    const disableSelection =
      isCommitting ||
      this.state.isChangingStagedFiles ||
      rebaseConflictState !== null ||
      isUncommittableSubmodule ||
      hasUnresolvedConflict

    const checkboxTooltip = hasUnresolvedConflict
      ? 'Resolve this conflict before staging the file.'
      : isUncommittableSubmodule
      ? 'This submodule change cannot be added to a commit in this repository because it contains changes that have not been committed.'
      : isPartiallyCommittableSubmodule
      ? 'Only changes that have been committed within the submodule will be added to this repository. You need to commit any other modified or untracked changes in the submodule before including them in this repository.'
      : undefined

    return (
      <ChangedFile
        file={file}
        status={changeListItem.status}
        include={
          changeListItem.section === undefined &&
          isPartiallyCommittableSubmodule &&
          include
            ? null
            : include
        }
        key={changeListItem.id}
        onIncludeChanged={
          changeListItem.section === undefined
            ? onIncludeChanged
            : this.onTreeFileStageChanged
        }
        availableWidth={availableWidth}
        disableSelection={disableSelection}
        checkboxTooltip={checkboxTooltip}
        focused={this.state.focusedRow === changeListItem.id}
        matches={matches}
      />
    )
  }

  private onDiscardAllChanges = () => {
    this.props.onDiscardChangesFromFiles(
      this.props.workingDirectory.files,
      true
    )
  }

  private onStashChanges = () => {
    this.props.dispatcher.createStashForCurrentBranch(this.props.repository)
  }

  private onDiscardChanges = (files: ReadonlyArray<string>) => {
    const workingDirectory = this.props.workingDirectory

    if (files.length === 1) {
      const modifiedFile = workingDirectory.files.find(f => f.path === files[0])

      if (modifiedFile != null) {
        this.props.onDiscardChanges(modifiedFile)
      }
    } else {
      const modifiedFiles = new Array<WorkingDirectoryFileChange>()

      files.forEach(file => {
        const modifiedFile = workingDirectory.files.find(f => f.path === file)

        if (modifiedFile != null) {
          modifiedFiles.push(modifiedFile)
        }
      })

      if (modifiedFiles.length > 0) {
        // DiscardAllChanges can also be used for discarding several selected changes.
        // Therefore, we update the pop up to reflect whether or not it is "all" changes.
        const discardingAllChanges =
          modifiedFiles.length === workingDirectory.files.length

        this.props.onDiscardChangesFromFiles(
          modifiedFiles,
          discardingAllChanges
        )
      }
    }
  }

  private getDiscardChangesMenuItemLabel = (files: ReadonlyArray<string>) => {
    const label =
      files.length === 1
        ? __DARWIN__
          ? `Discard Changes`
          : `Discard changes`
        : __DARWIN__
        ? `Discard ${files.length} Selected Changes`
        : `Discard ${files.length} selected changes`

    return this.props.askForConfirmationOnDiscardChanges ? `${label}…` : label
  }

  private onContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()

    // need to preserve the working directory state while dealing with conflicts
    if (this.props.rebaseConflictState !== null || this.props.isCommitting) {
      return
    }

    const hasLocalChanges = this.props.workingDirectory.files.length > 0
    const hasStash = this.props.stashEntry !== null
    const hasConflicts =
      this.props.conflictState !== null ||
      hasConflictedFiles(this.props.workingDirectory)

    const stashAllChangesLabel = __DARWIN__
      ? 'Stash All Changes'
      : 'Stash all changes'
    const confirmStashAllChangesLabel = __DARWIN__
      ? 'Stash All Changes…'
      : 'Stash all changes…'

    const items: IMenuItem[] = [
      {
        label: __DARWIN__ ? 'Discard All Changes…' : 'Discard all changes…',
        action: this.onDiscardAllChanges,
        enabled: hasLocalChanges,
      },
      {
        label: hasStash ? confirmStashAllChangesLabel : stashAllChangesLabel,
        action: this.onStashChanges,
        enabled: hasLocalChanges && this.props.branch !== null && !hasConflicts,
      },
    ]

    showContextualMenu(items)
  }

  private getDiscardChangesMenuItem = (
    paths: ReadonlyArray<string>
  ): IMenuItem => {
    return {
      label: this.getDiscardChangesMenuItemLabel(paths),
      action: () => this.onDiscardChanges(paths),
    }
  }

  private getCopyPathMenuItem = (
    file: WorkingDirectoryFileChange
  ): IMenuItem => {
    return {
      label: CopyFilePathLabel,
      action: () => {
        const fullPath = Path.join(this.props.repository.path, file.path)
        clipboard.writeText(fullPath)
      },
    }
  }

  private getCopyRelativePathMenuItem = (
    file: WorkingDirectoryFileChange
  ): IMenuItem => {
    return {
      label: CopyRelativeFilePathLabel,
      action: () => clipboard.writeText(Path.normalize(file.path)),
    }
  }

  private getCopySelectedPathsMenuItem = (
    files: WorkingDirectoryFileChange[]
  ): IMenuItem => {
    return {
      label: CopySelectedPathsLabel,
      action: () => {
        const fullPaths = files.map(file =>
          Path.join(this.props.repository.path, file.path)
        )
        clipboard.writeText(fullPaths.join(EOL))
      },
    }
  }

  private getCopySelectedRelativePathsMenuItem = (
    files: WorkingDirectoryFileChange[]
  ): IMenuItem => {
    return {
      label: CopySelectedRelativePathsLabel,
      action: () => {
        const paths = files.map(file => Path.normalize(file.path))
        clipboard.writeText(paths.join(EOL))
      },
    }
  }

  private getRevealInFileManagerMenuItem = (
    file: WorkingDirectoryFileChange
  ): IMenuItem => {
    return {
      label: RevealInFileManagerLabel,
      action: () => revealInFileManager(this.props.repository, file.path),
      enabled: file.status.kind !== AppFileStatusKind.Deleted,
    }
  }

  private getOpenInExternalEditorMenuItem = (
    file: WorkingDirectoryFileChange,
    enabled: boolean
  ): IMenuItem => {
    const { externalEditorLabel } = this.props

    const openInExternalEditor = externalEditorLabel
      ? `Open in ${externalEditorLabel}`
      : DefaultEditorLabel

    return {
      label: openInExternalEditor,
      action: () => {
        this.props.onOpenItemInExternalEditor(file.path)
      },
      enabled,
    }
  }

  private getDefaultContextMenu(
    file: WorkingDirectoryFileChange,
    section?: ChangeFileListSection
  ): ReadonlyArray<IMenuItem> {
    const { id, path, status } = file

    const extension = Path.extname(path)
    const isSafeExtension = isSafeFileExtension(extension)

    const { workingDirectory, selectedFileIDs } = this.props

    const selectedFiles = new Array<WorkingDirectoryFileChange>()
    const paths = new Array<string>()
    const extensions = new Set<string>()

    const addItemToArray = (fileID: string) => {
      const newFile = workingDirectory.findFileWithID(fileID)
      if (newFile) {
        selectedFiles.push(newFile)
        paths.push(newFile.path)

        const extension = Path.extname(newFile.path)
        if (extension.length) {
          extensions.add(extension)
        }
      }
    }

    if (selectedFileIDs.includes(id)) {
      // user has selected a file inside an existing selection
      // -> context menu entries should be applied to all selected files
      selectedFileIDs.forEach(addItemToArray)
    } else {
      // this is outside their previous selection
      // -> context menu entries should be applied to just this file
      addItemToArray(id)
    }

    const items: IMenuItem[] = [
      this.getDiscardChangesMenuItem(paths),
      { type: 'separator' },
    ]
    if (paths.length === 1) {
      const enabled = Path.basename(path) !== GitIgnoreFileName
      items.push({
        label: __DARWIN__
          ? 'Ignore File (Add to .gitignore)'
          : 'Ignore file (add to .gitignore)',
        action: () => this.props.onIgnoreFile(path),
        enabled,
      })

      // Even on Windows, the path separator is '/' for git operations so cannot
      // use Path.sep
      const pathComponents = path.split('/').slice(0, -1)
      if (pathComponents.length > 0) {
        const submenu = pathComponents.map((_, index) => {
          const label = `/${pathComponents
            .slice(0, pathComponents.length - index)
            .join('/')}`
          return {
            label,
            action: () => this.props.onIgnoreFile(label),
          }
        })

        items.push({
          label: __DARWIN__
            ? 'Ignore Folder (Add to .gitignore)'
            : 'Ignore folder (add to .gitignore)',
          submenu,
          enabled,
        })
      }
    } else if (paths.length > 1) {
      items.push({
        label: __DARWIN__
          ? `Ignore ${paths.length} Selected Files (Add to .gitignore)`
          : `Ignore ${paths.length} selected files (add to .gitignore)`,
        action: () => {
          // Filter out any .gitignores that happens to be selected, ignoring
          // those doesn't make sense.
          this.props.onIgnoreFile(
            paths.filter(path => Path.basename(path) !== GitIgnoreFileName)
          )
        },
        // Enable this action as long as there's something selected which isn't
        // a .gitignore file.
        enabled: paths.some(path => Path.basename(path) !== GitIgnoreFileName),
      })
    }
    // Five menu items should be enough for everyone
    Array.from(extensions)
      .slice(0, 5)
      .forEach(extension => {
        items.push({
          label: __DARWIN__
            ? `Ignore All ${extension} Files (Add to .gitignore)`
            : `Ignore all ${extension} files (add to .gitignore)`,
          action: () => this.props.onIgnorePattern(`*${extension}`),
        })
      })

    if (section !== undefined) {
      const staged = section === ChangeFileListSection.Unstaged
      items.push(
        { type: 'separator' },
        {
          label: staged
            ? selectedFiles.length > 1
              ? 'Stage selected files'
              : 'Stage file'
            : selectedFiles.length > 1
            ? 'Unstage selected files'
            : 'Unstage file',
          action: () => this.changeFileStaged(selectedFiles, staged),
          enabled:
            !this.state.isChangingStagedFiles &&
            (!staged || selectedFiles.every(file => this.canStageFile(file))),
        }
      )
    }

    if (paths.length > 1) {
      if (section === undefined) {
        items.push(
          { type: 'separator' },
          {
            label: __DARWIN__
              ? 'Include Selected Files'
              : 'Include selected files',
            action: () => {
              selectedFiles.forEach(file =>
                this.props.onIncludeChanged(file, true)
              )
            },
          },
          {
            label: __DARWIN__
              ? 'Exclude Selected Files'
              : 'Exclude selected files',
            action: () => {
              selectedFiles.forEach(file =>
                this.props.onIncludeChanged(file, false)
              )
            },
          }
        )
      }

      items.push(
        { type: 'separator' },
        this.getCopySelectedPathsMenuItem(selectedFiles),
        this.getCopySelectedRelativePathsMenuItem(selectedFiles)
      )
    } else {
      items.push(
        { type: 'separator' },
        this.getCopyPathMenuItem(file),
        this.getCopyRelativePathMenuItem(file)
      )
    }

    const enabled = status.kind !== AppFileStatusKind.Deleted
    items.push(
      { type: 'separator' },
      this.getRevealInFileManagerMenuItem(file),
      this.getOpenInExternalEditorMenuItem(file, enabled),
      {
        label: OpenWithDefaultProgramLabel,
        action: () => this.props.onOpenItem(path),
        enabled: enabled && isSafeExtension,
      }
    )

    return items
  }

  private getRebaseContextMenu(
    file: WorkingDirectoryFileChange
  ): ReadonlyArray<IMenuItem> {
    const { path, status } = file

    const extension = Path.extname(path)
    const isSafeExtension = isSafeFileExtension(extension)

    const items = new Array<IMenuItem>()

    if (file.status.kind === AppFileStatusKind.Untracked) {
      items.push(this.getDiscardChangesMenuItem([file.path]), {
        type: 'separator',
      })
    }

    const enabled = status.kind !== AppFileStatusKind.Deleted

    items.push(
      this.getCopyPathMenuItem(file),
      this.getCopyRelativePathMenuItem(file),
      { type: 'separator' },
      this.getRevealInFileManagerMenuItem(file),
      this.getOpenInExternalEditorMenuItem(file, enabled),
      {
        label: OpenWithDefaultProgramLabel,
        action: () => this.props.onOpenItem(path),
        enabled: enabled && isSafeExtension,
      }
    )

    return items
  }

  private onItemContextMenu = (
    item: IChangesListItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    const file = item.change

    if (this.props.isCommitting) {
      return
    }

    event.preventDefault()

    const items =
      this.props.rebaseConflictState === null
        ? this.getDefaultContextMenu(file, item.section)
        : this.getRebaseContextMenu(file)

    showContextualMenu(items)
  }

  private getPlaceholderMessage(
    files: ReadonlyArray<WorkingDirectoryFileChange>,
    prepopulateCommitSummary: boolean
  ) {
    if (!prepopulateCommitSummary) {
      return 'Summary (required)'
    }

    const firstFile = files[0]
    const fileName = basename(firstFile.path)

    switch (firstFile.status.kind) {
      case AppFileStatusKind.New:
      case AppFileStatusKind.Untracked:
        return `Create ${fileName}`
      case AppFileStatusKind.Deleted:
        return `Delete ${fileName}`
      default:
        // TODO:
        // this doesn't feel like a great message for AppFileStatus.Copied or
        // AppFileStatus.Renamed but without more insight (and whether this
        // affects other parts of the flow) we can just default to this for now
        return `Update ${fileName}`
    }
  }

  private onScroll = (scrollTop: number, _clientHeight: number) => {
    this.props.onChangesListScrolled(scrollTop, 'classic')
  }

  private onStagedScroll = (scrollTop: number, _clientHeight: number) => {
    this.stagedScrollTop = scrollTop
    this.props.onChangesListScrolled(scrollTop, ChangeFileListSection.Staged)
  }

  private onUnstagedScroll = (scrollTop: number, _clientHeight: number) => {
    this.unstagedScrollTop = scrollTop
    this.props.onChangesListScrolled(scrollTop, ChangeFileListSection.Unstaged)
  }

  private renderEmptyTreeSection = () => null

  private renderCommitMessageForm = (): JSX.Element => {
    const {
      rebaseConflictState,
      workingDirectory,
      repository,
      repositoryAccount,
      dispatcher,
      isCommitting,
      hookProgress,
      isGeneratingCommitMessage,
      commitToAmend,
      currentBranchProtected,
      currentRepoRulesInfo: currentRepoRulesInfo,
      shouldShowGenerateCommitMessageCallOut,
    } = this.props

    if (rebaseConflictState !== null) {
      const hasUntrackedChanges = workingDirectory.files.some(
        f => f.status.kind === AppFileStatusKind.Untracked
      )

      return (
        <ContinueRebase
          dispatcher={dispatcher}
          repository={repository}
          rebaseConflictState={rebaseConflictState}
          workingDirectory={workingDirectory}
          isCommitting={isCommitting}
          hasUntrackedChanges={hasUntrackedChanges}
        />
      )
    }

    const fileCount = workingDirectory.files.length

    // Files selected to commit (to be committed) (not selected to see in diff)
    const filesSelected = this.props.isUsingStagingWorkflow
      ? workingDirectory.files.filter(file => file.hasStagedChanges)
      : workingDirectory.files.filter(
          file => file.selection.getSelectionType() !== DiffSelectionType.None
        )

    const anyFilesSelected = filesSelected.length > 0

    // When a single file is selected, we use a default commit summary
    // based on the file name and change status.
    // However, for onboarding tutorial repositories, we don't want to do this.
    // See https://github.com/desktop/desktop/issues/8354
    const prepopulateCommitSummary =
      filesSelected.length === 1 && !repository.isTutorialRepository

    // if this is not a github repo, we don't want to
    // restrict what the user can do at all
    const hasWritePermissionForRepository =
      this.props.repository.gitHubRepository === null ||
      hasWritePermission(this.props.repository.gitHubRepository)

    const showPromptForCommittingFileHiddenByFilter =
      this.props.askForConfirmationOnCommitFilteredChanges &&
      isCommittingFileHiddenByFilter(
        filesSelected.map(f => f.id),
        this.state.filteredItems,
        fileCount,
        this.props.fileListFilter
      )

    return (
      <CommitMessage
        onCreateCommit={this.props.onCreateCommit}
        branch={this.props.branch}
        mostRecentLocalCommit={this.props.mostRecentLocalCommit}
        commitAuthor={this.props.commitAuthor}
        isShowingModal={this.props.isShowingModal}
        isShowingFoldout={this.props.isShowingFoldout}
        anyFilesSelected={anyFilesSelected}
        showPromptForCommittingFileHiddenByFilter={
          showPromptForCommittingFileHiddenByFilter
        }
        anyFilesAvailable={fileCount > 0}
        filesSelected={filesSelected}
        filesToBeCommittedCount={filesSelected.length}
        repository={repository}
        repositoryAccount={repositoryAccount}
        commitMessage={this.props.commitMessage}
        focusCommitMessage={this.props.focusCommitMessage}
        autocompletionProviders={this.props.autocompletionProviders}
        isCommitting={isCommitting}
        hookProgress={hookProgress}
        onShowCommitProgress={this.props.onShowCommitProgress}
        isGeneratingCommitMessage={isGeneratingCommitMessage}
        shouldShowGenerateCommitMessageCallOut={
          shouldShowGenerateCommitMessageCallOut
        }
        commitToAmend={commitToAmend}
        showCoAuthoredBy={this.props.showCoAuthoredBy}
        coAuthors={this.props.coAuthors}
        placeholder={this.getPlaceholderMessage(
          filesSelected,
          prepopulateCommitSummary
        )}
        prepopulateCommitSummary={prepopulateCommitSummary}
        key={repository.id}
        showBranchProtected={fileCount > 0 && currentBranchProtected}
        repoRulesInfo={currentRepoRulesInfo}
        aheadBehind={this.props.aheadBehind}
        showNoWriteAccess={fileCount > 0 && !hasWritePermissionForRepository}
        shouldNudge={this.props.shouldNudgeToCommit}
        commitSpellcheckEnabled={this.props.commitSpellcheckEnabled}
        showCommitLengthWarning={this.props.showCommitLengthWarning}
        onCoAuthorsUpdated={this.onCoAuthorsUpdated}
        onShowCoAuthoredByChanged={this.onShowCoAuthoredByChanged}
        onConfirmCommitWithUnknownCoAuthors={
          this.onConfirmCommitWithUnknownCoAuthors
        }
        onPersistCommitMessage={this.onPersistCommitMessage}
        onGenerateCommitMessage={this.onGenerateCommitMessage}
        onCancelGenerateCommitMessage={this.onCancelGenerateCommitMessage}
        onCommitMessageFocusSet={this.onCommitMessageFocusSet}
        onRefreshAuthor={this.onRefreshAuthor}
        onShowPopup={this.onShowPopup}
        onShowFoldout={this.onShowFoldout}
        onCommitSpellcheckEnabledChanged={this.onCommitSpellcheckEnabledChanged}
        onStopAmending={this.onStopAmending}
        onShowCreateForkDialog={this.onShowCreateForkDialog}
        onFilesToCommitNotVisible={this.onFilesToCommitNotVisible}
        accounts={this.props.accounts}
        onSuccessfulCommitCreated={this.onSuccessfulCommitCreated}
        submitButtonAriaDescribedBy={'hidden-changes-warning'}
        skipCommitHooks={this.props.skipCommitHooks}
        signOffCommits={this.props.signOffCommits}
        allowEmptyCommit={this.props.allowEmptyCommit}
        showAllowEmptyCommitOption={true}
        onUpdateCommitOptions={this.props.onUpdateCommitOptions}
      />
    )
  }

  private onSuccessfulCommitCreated = () => {
    this.clearFilter()
  }

  private onCoAuthorsUpdated = (coAuthors: ReadonlyArray<Author>) =>
    this.props.dispatcher.setCoAuthors(this.props.repository, coAuthors)

  private onShowCoAuthoredByChanged = (showCoAuthors: boolean) => {
    const { dispatcher, repository } = this.props
    dispatcher.setShowCoAuthoredBy(repository, showCoAuthors)
  }

  private onConfirmCommitWithUnknownCoAuthors = (
    coAuthors: ReadonlyArray<UnknownAuthor>,
    onCommitAnyway: () => void
  ) => {
    const { dispatcher } = this.props
    dispatcher.showUnknownAuthorsCommitWarning(coAuthors, onCommitAnyway)
  }

  private onRefreshAuthor = () =>
    this.props.dispatcher.refreshAuthor(this.props.repository)

  private onCommitMessageFocusSet = () =>
    this.props.dispatcher.setCommitMessageFocus(false)

  private onPersistCommitMessage = (message: ICommitMessage) =>
    this.props.dispatcher.setCommitMessage(this.props.repository, message)

  private onGenerateCommitMessage = (
    filesSelected: ReadonlyArray<WorkingDirectoryFileChange>,
    mustOverrideExistingMessage: boolean
  ) => {
    this.props.dispatcher.incrementMetric(
      'generateCommitMessageButtonClickCount'
    )

    return mustOverrideExistingMessage
      ? this.props.dispatcher.promptOverrideWithGeneratedCommitMessage(
          this.props.repository,
          filesSelected
        )
      : this.props.dispatcher.generateCommitMessage(
          this.props.repository,
          filesSelected
        )
  }

  private onCancelGenerateCommitMessage = () => {
    this.props.dispatcher.cancelGenerateCommitMessage(this.props.repository)
  }

  private onShowPopup = (p: Popup) => this.props.dispatcher.showPopup(p)
  private onShowFoldout = (f: Foldout) => this.props.dispatcher.showFoldout(f)

  private onCommitSpellcheckEnabledChanged = (enabled: boolean) =>
    this.props.dispatcher.setCommitSpellcheckEnabled(enabled)

  private onStopAmending = () =>
    this.props.dispatcher.stopAmendingRepository(this.props.repository)

  private onShowCreateForkDialog = () => {
    if (isRepositoryWithGitHubRepository(this.props.repository)) {
      this.props.dispatcher.showCreateForkDialog(this.props.repository)
    }
  }

  private onStashEntryClicked = () => {
    const { isShowingStashEntry, dispatcher, repository } = this.props

    if (isShowingStashEntry) {
      dispatcher.selectWorkingDirectoryFiles(repository)

      // If the button is clicked, that implies the stash was not restored or discarded
      dispatcher.incrementMetric('noActionTakenOnStashCount')
    } else {
      dispatcher.selectStashedFile(repository)
      dispatcher.incrementMetric('stashViewCount')
    }
  }

  private renderStashedChanges() {
    if (this.props.stashEntry === null) {
      return null
    }

    const className = classNames(
      'stashed-changes-button',
      this.props.isShowingStashEntry ? 'selected' : null
    )

    return (
      <button
        className={className}
        onClick={this.onStashEntryClicked}
        tabIndex={0}
        aria-expanded={this.props.isShowingStashEntry}
        aria-controls={
          this.props.isShowingStashEntry ? StashDiffViewerId : undefined
        }
      >
        <Octicon className="stack-icon" symbol={StashIcon} />
        <div className="text">Stashed Changes</div>
        <Octicon symbol={octicons.chevronRight} />
      </button>
    )
  }

  private onChangedFileDoubleClick = (item: IChangesListItem) => {
    this.props.onOpenItemInExternalEditor(item.change.path)
  }

  private onItemKeyDown = (
    _item: IChangesListItem,
    event: React.KeyboardEvent<HTMLDivElement>
  ) => {
    // The commit is already in-flight but this check prevents the
    // user from changing selection.
    if (
      this.props.isCommitting &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault()
    }

    return
  }

  public focus() {
    if (this.props.showChangesFilter) {
      this.filterOptionsButtonRef?.focus()
      return
    }

    this.includeAllCheckBoxRef.current?.focus()
  }

  private onChangedFileClick = (
    item: IChangesListItem,
    source: ClickSource
  ) => {
    if (source.kind === 'keyboard' && item.section !== undefined) {
      const staged = item.section === ChangeFileListSection.Unstaged

      if (staged && !this.canStageFile(item.change)) {
        return
      }

      this.changeFileStaged(item.change, staged)
      return
    }

    const fileIndex = this.props.workingDirectory.findFileIndexByID(
      item.change.id
    )

    this.props.onRowClick?.(fileIndex, source)
  }

  private onFilterTextChanged = (text: string) => {
    if (this.props.fileListFilter.filterText === '' && text !== '') {
      this.props.dispatcher.incrementMetric('typedInChangesFilterCount')
    }

    this.props.dispatcher.setChangesListFilterText(this.props.repository, text)
  }

  private onFileSelectionChanged = (items: ReadonlyArray<IChangesListItem>) => {
    this.lastSelectedItems = items
    this.setState({ selectedItems: items })

    this.notifyFileSelectionChanged(items)
  }

  private notifyFileSelectionChanged(
    items: ReadonlyArray<IChangesListItem>,
    requestedDiffKind?: WorkingDirectoryDiffKind
  ) {
    const rows = Array.from(new Set(items.map(i => i.change.id)))
      .map(id => this.props.workingDirectory.findFileIndexByID(id))
      .filter(row => row !== -1)
    const selectedSection = items.length === 1 ? items[0].section : undefined
    const diffKind =
      requestedDiffKind ??
      (selectedSection === ChangeFileListSection.Staged
        ? WorkingDirectoryDiffKind.Staged
        : selectedSection === ChangeFileListSection.Unstaged
        ? WorkingDirectoryDiffKind.Unstaged
        : WorkingDirectoryDiffKind.Combined)
    this.props.onFileSelectionChanged(rows, diffKind)
  }

  private onFilesToCommitNotVisible = (onCommitAnyway: () => void) => {
    this.props.dispatcher.showPopup({
      type: PopupType.ConfirmCommitFilteredChanges,
      onCommitAnyway,
      showFilesToBeCommitted: this.showFilesToBeCommitted,
    })
  }

  private clearFilter = () => {
    this.props.dispatcher.setChangesListFilterText(this.props.repository, '')
  }

  private showFilesToBeCommitted = () => {
    this.props.dispatcher.incrementMetric(
      'adjustedFiltersForHiddenChangesCount'
    )
    // Clear all filters first to ensure all files are visible
    this.clearFilter()
    this.props.dispatcher.setFilterExcludedFiles(this.props.repository, false)
    this.props.dispatcher.setFilterNewFiles(this.props.repository, false)
    this.props.dispatcher.setFilterModifiedFiles(this.props.repository, false)
    this.props.dispatcher.setFilterDeletedFiles(this.props.repository, false)

    // Then apply only the "Included in commit" filter to show only files being committed
    this.props.dispatcher.setIncludedChangesInCommitFilter(
      this.props.repository,
      true
    )
  }

  private onTextBoxRef = (component: TextBox | null) => {
    this.filterTextBox = component ?? undefined
  }

  private onFilterKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (this.state.viewMode === ChangesListViewMode.Tree) {
      const hasVisibleStagedItems = Array.from(
        this.state.filteredItems.values()
      ).some(item => item.section === ChangeFileListSection.Staged)
      const preferredList = hasVisibleStagedItems
        ? this.stagedFilterListRef.current
        : this.unstagedFilterListRef.current
      preferredList?.onKeyDown(event)
      return
    }

    this.filterListRef.current?.onKeyDown(event)
  }

  private renderFilterRow = () => {
    return (
      <div
        className="header filter-field-row"
        onContextMenu={this.onContextMenu}
        ref={this.headerRef}
      >
        {this.renderFilterBox()}
        {this.renderCheckBoxRow()}
      </div>
    )
  }

  private renderCheckBoxRow = () => {
    const { workingDirectory, rebaseConflictState, isCommitting } = this.props
    const { files } = workingDirectory
    const isSubmodulesView =
      this.state.viewMode === ChangesListViewMode.Submodules
    const showSubmodulesView =
      isSubmodulesView || this.props.submodules.length > 0
    const submoduleCount = formatNumber(this.props.submodules.length)
    const submoduleTooltip = isSubmodulesView
      ? 'Hide submodules'
      : `Show ${submoduleCount} submodule${plural(
          this.props.submodules.length
        )}`

    const visibleFiles = this.getUniqueFilteredChanges().length

    const filteredItems = Array.from(this.state.filteredItems.values())
    const includeAllValue = this.props.isUsingStagingWorkflow
      ? filteredItems.length === 0 ||
        filteredItems.every(
          item => item.section === ChangeFileListSection.Unstaged
        )
        ? CheckboxValue.Off
        : filteredItems.every(
            item => item.section === ChangeFileListSection.Staged
          )
        ? CheckboxValue.On
        : CheckboxValue.Mixed
      : this.getCheckAllValue(
          workingDirectory,
          rebaseConflictState,
          this.state.filteredItems
        )

    const disableAllCheckbox =
      files.length === 0 ||
      filteredItems.every(
        item =>
          item.section === ChangeFileListSection.Unstaged &&
          !this.canStageFile(item.change)
      ) ||
      isCommitting ||
      this.state.isChangingStagedFiles ||
      rebaseConflictState !== null

    const checkAllLabel = `${
      visibleFiles !== files.length ? `${formatNumber(visibleFiles)} of ` : ''
    }
    ${formatNumber(files.length)} changed file${plural(files.length)}`

    return (
      <div className="checkbox-container">
        {!isSubmodulesView && (
          <Checkbox
            ref={this.includeAllCheckBoxRef}
            value={includeAllValue}
            onChange={this.onIncludeAllChanged}
            disabled={disableAllCheckbox}
            ariaLabelledBy="changes-list-check-all-label"
            className="changes-list-check-all"
            label={checkAllLabel}
          />
        )}
        {showSubmodulesView && (
          <Button
            className={classNames('submodules-view-button', {
              selected: isSubmodulesView,
            })}
            size="small"
            tooltip={submoduleTooltip}
            ariaLabel={`Submodules (${submoduleCount})`}
            ariaPressed={isSubmodulesView}
            onClick={this.onSubmodulesViewModeClick}
          >
            <Octicon symbol={octicons.fileSubmodule} />
            <span className="submodules-view-count">{submoduleCount}</span>
          </Button>
        )}
      </div>
    )
  }

  private renderFilterBox = () => {
    const isClassicView = this.state.viewMode === ChangesListViewMode.Classic
    const isTreeView = this.state.viewMode === ChangesListViewMode.Tree
    const isSubmodulesView =
      this.state.viewMode === ChangesListViewMode.Submodules
    const hasPartiallyStagedFiles = this.props.workingDirectory.files.some(
      file => file.hasStagedChanges && file.hasUnstagedChanges
    )
    const classicViewTooltip = hasPartiallyStagedFiles
      ? 'Unstage or commit partially staged files before switching to Classic view.'
      : undefined

    return (
      <div className="filter-box-container">
        <div
          className="changes-list-view-toggle"
          role="group"
          aria-label="Changes layout"
        >
          <button
            type="button"
            className={classNames('changes-list-view-toggle-button', {
              selected: isClassicView,
            })}
            aria-pressed={isClassicView}
            disabled={
              this.state.isChangingStagingWorkflow ||
              this.state.isChangingStagedFiles ||
              hasPartiallyStagedFiles
            }
            aria-label={classicViewTooltip ?? 'Classic view'}
            onClick={this.onClassicViewModeClick}
          >
            Classic
          </button>
          <button
            type="button"
            className={classNames('changes-list-view-toggle-button', {
              selected: isTreeView,
            })}
            aria-pressed={isTreeView}
            disabled={
              this.state.isChangingStagingWorkflow ||
              this.state.isChangingStagedFiles
            }
            onClick={this.onTreeViewModeClick}
          >
            Tree
          </button>
        </div>
        {this.props.showChangesFilter && (
          <div
            className={classNames('changes-filter-control', {
              'has-filter-options': !isSubmodulesView,
            })}
          >
            {!isSubmodulesView && (
              <ChangesListFilterOptions
                fileListFilter={this.props.fileListFilter}
                filteredItems={this.state.filteredItems}
                onFilterToIncludedInCommit={this.onFilterToIncludedInCommit}
                onFilterExcludedFiles={this.onFilterExcludedFiles}
                onFilterDeletedFiles={this.onFilterDeletedFiles}
                onFilterModifiedFiles={this.onFilterModifiedFiles}
                onFilterNewFiles={this.onFilterNewFiles}
                onClearAllFilters={this.onClearAllFilters}
              />
            )}
            <TextBox
              ref={this.onTextBoxRef}
              displayClearButton={true}
              placeholder={'Filter'}
              className="filter-list-filter-field"
              onValueChanged={this.onFilterTextChanged}
              onKeyDown={this.onFilterKeyDown}
              value={this.props.fileListFilter.filterText}
            />
          </div>
        )}
      </div>
    )
  }

  private applyFilters = (item: IChangesListItem) => {
    return applyFilters(
      item,
      this.props.showChangesFilter,
      this.props.fileListFilter
    )
  }

  private getFilterMethod = () => {
    return this.props.fileListFilter.isIncludedInCommit ||
      this.props.fileListFilter.isNewFile ||
      this.props.fileListFilter.isModifiedFile ||
      this.props.fileListFilter.isDeletedFile ||
      this.props.fileListFilter.isExcludedFromCommit
      ? this.applyFilters
      : undefined
  }

  private getListInvalidationProps = () => {
    return {
      workingDirectory: this.props.workingDirectory,
      isCommitting: this.props.isCommitting,
      focusedRow: this.state.focusedRow,
      showChangesFilter: this.props.showChangesFilter,
      viewMode: this.state.viewMode,
      filterNewFiles: this.props.fileListFilter.isNewFile,
      filterModifiedFiles: this.props.fileListFilter.isModifiedFile,
      filterDeletedFiles: this.props.fileListFilter.isDeletedFile,
      filterExcludedFiles: this.props.fileListFilter.isExcludedFromCommit,
    }
  }

  private getListAriaLabel = () => {
    const { files } = this.props.workingDirectory
    return `${formatNumber(files.length)} changed file${plural(files.length)}`
  }

  private renderClassicChangesList = () => {
    return (
      <AugmentedSectionFilterList<IChangesListItem>
        ref={this.filterListRef}
        id="changes-list"
        rowHeight={RowHeight}
        filterText={
          this.props.showChangesFilter
            ? this.props.fileListFilter.filterText
            : ''
        }
        filterTextBox={this.filterTextBox}
        selectedItems={this.state.selectedItems}
        selectionMode="multi"
        renderItem={this.renderChangedFile}
        onItemClick={this.onChangedFileClick}
        onItemDoubleClick={this.onChangedFileDoubleClick}
        onItemKeyboardFocus={this.onChangedFileFocus}
        onItemBlur={this.onChangedFileBlur}
        onScroll={this.onScroll}
        setScrollTop={this.props.changesListScrollTop}
        onItemKeyDown={this.onItemKeyDown}
        onSelectionChanged={this.onFileSelectionChanged}
        groups={this.state.groups}
        filterMethod={this.getFilterMethod()}
        invalidationProps={this.getListInvalidationProps()}
        onItemContextMenu={this.onItemContextMenu}
        hideFilterRow={true}
        getGroupAriaLabel={this.getListAriaLabel}
        renderNoItems={this.renderNoChanges}
        postNoResultsMessage={getNoResultsMessage(this.props.fileListFilter)}
      />
    )
  }

  private renderTreeSection = (
    section: ChangeFileListSection,
    ref: React.RefObject<AugmentedSectionFilterList<IChangesListItem>>,
    style: React.CSSProperties
  ) => {
    const group = this.getSectionGroup(section) ?? {
      identifier: section,
      showHeader: false,
      items: [],
    }
    const isStagedSection = section === ChangeFileListSection.Staged

    return (
      <div className="changes-file-section" style={style}>
        {this.renderSectionHeader(section)}
        <AugmentedSectionFilterList<IChangesListItem>
          ref={ref}
          id={`changes-list-${section}`}
          rowHeight={RowHeight}
          filterText={
            this.props.showChangesFilter
              ? this.props.fileListFilter.filterText
              : ''
          }
          filterTextBox={this.filterTextBox}
          selectedItems={this.state.selectedItems.filter(
            item => item.section === section
          )}
          selectFirstItemOnFilter={false}
          selectionMode="multi"
          renderItem={this.renderChangedFile}
          onItemClick={this.onChangedFileClick}
          onItemDoubleClick={this.onChangedFileDoubleClick}
          onItemKeyboardFocus={this.onChangedFileFocus}
          onItemBlur={this.onChangedFileBlur}
          onScroll={
            isStagedSection ? this.onStagedScroll : this.onUnstagedScroll
          }
          setScrollTop={
            isStagedSection ? this.stagedScrollTop : this.unstagedScrollTop
          }
          onItemKeyDown={this.onItemKeyDown}
          onSelectionChanged={this.onFileSelectionChanged}
          groups={[group]}
          filterMethod={this.getFilterMethod()}
          invalidationProps={this.getListInvalidationProps()}
          onItemContextMenu={this.onItemContextMenu}
          hideFilterRow={true}
          getGroupAriaLabel={this.getListAriaLabel}
          renderNoItems={this.renderEmptyTreeSection}
          postNoResultsMessage={getNoResultsMessage(this.props.fileListFilter)}
        />
      </div>
    )
  }

  private renderTreeChangesList = () => {
    const stagedBasis = `${this.state.treeSplitRatio * 100}%`
    const unstagedBasis = `${(1 - this.state.treeSplitRatio) * 100}%`

    return (
      <div className="changes-file-tree-layout" ref={this.splitViewRef}>
        {this.renderTreeSection(
          ChangeFileListSection.Staged,
          this.stagedFilterListRef,
          { flexBasis: stagedBasis }
        )}
        <button
          type="button"
          className="changes-file-section-resizer"
          aria-label={`Resize staged and unstaged files, ${Math.round(
            this.state.treeSplitRatio * 100
          )} percent staged`}
          onMouseDown={this.onTreeSectionResizeMouseDown}
          onKeyDown={this.onTreeSectionResizeKeyDown}
        />
        {this.renderTreeSection(
          ChangeFileListSection.Unstaged,
          this.unstagedFilterListRef,
          { flexBasis: unstagedBasis }
        )}
      </div>
    )
  }

  private renderSubmodulesList = () => {
    return (
      <SubmodulesList
        dispatcher={this.props.dispatcher}
        repository={this.props.repository}
        submodules={this.props.submodules}
        workingDirectory={this.props.workingDirectory}
        filterText={
          this.props.showChangesFilter
            ? this.props.fileListFilter.filterText
            : ''
        }
        onOpenSubmodule={this.props.onOpenSubmodule}
      />
    )
  }

  public render() {
    return (
      <>
        <div className="changes-list-container file-list filtered-changes-list">
          {this.renderFilterRow()}
          {this.state.viewMode === ChangesListViewMode.Classic
            ? this.renderClassicChangesList()
            : this.state.viewMode === ChangesListViewMode.Tree
            ? this.renderTreeChangesList()
            : this.renderSubmodulesList()}
        </div>
        {this.renderStashedChanges()}
        {this.renderHiddenChangesWarning()}
        {this.renderCommitMessageForm()}
      </>
    )
  }

  private renderHiddenChangesWarning = () => {
    const { files } = this.props.workingDirectory
    const filesSelected = this.props.isUsingStagingWorkflow
      ? files.filter(file => file.hasStagedChanges)
      : files.filter(
          file => file.selection.getSelectionType() !== DiffSelectionType.None
        )

    if (
      !isCommittingFileHiddenByFilter(
        filesSelected.map(f => f.id),
        this.state.filteredItems,
        files.length,
        this.props.fileListFilter
      )
    ) {
      return null
    }

    return (
      <div className="hidden-changes-warning" id="hidden-changes-warning">
        <Octicon symbol={octicons.alert} />
        <span className="sr-only">Warning:</span>
        <span>Hidden changes will be committed. </span>
        <LinkButton onClick={this.showFilesToBeCommitted}>
          Adjust the filters to see all {formatNumber(filesSelected.length)}{' '}
          changes
        </LinkButton>
      </div>
    )
  }

  private renderNoChanges = () => {
    if (!hasActiveFilters(this.props.fileListFilter)) {
      return null
    }

    // Check if any filters are active (including text filter)
    const filtersActive = hasActiveFilters(this.props.fileListFilter)

    const BlankSlateImage = encodePathAsUrl(
      __dirname,
      'static/empty-no-file-selected.svg'
    )

    return (
      <div className="no-changes-filtered">
        <img src={BlankSlateImage} className="blankslate-image" alt="" />

        <div className="title">No files match your current filters</div>

        <div className="subtitle">
          {getNoResultsMessage(this.props.fileListFilter)}
        </div>

        {filtersActive && (
          <Button
            className="clear-filters-button"
            onClick={this.onClearAllFilters}
          >
            Clear filters
          </Button>
        )}
      </div>
    )
  }

  private onFilterToIncludedInCommit = () => {
    if (!this.props.fileListFilter.isIncludedInCommit) {
      this.props.dispatcher.incrementMetric(
        'appliesIncludedInCommitFilterCount'
      )
    }
    this.props.dispatcher.setIncludedChangesInCommitFilter(
      this.props.repository,
      !this.props.fileListFilter.isIncludedInCommit
    )
  }

  private onFilterNewFiles = () => {
    if (!this.props.fileListFilter.isNewFile) {
      this.props.dispatcher.incrementMetric('appliesNewFilesChangesFilterCount')
    }
    this.props.dispatcher.setFilterNewFiles(
      this.props.repository,
      !this.props.fileListFilter.isNewFile
    )
  }

  private onFilterModifiedFiles = () => {
    if (!this.props.fileListFilter.isModifiedFile) {
      this.props.dispatcher.incrementMetric(
        'appliesModifiedFilesChangesFilterCount'
      )
    }
    this.props.dispatcher.setFilterModifiedFiles(
      this.props.repository,
      !this.props.fileListFilter.isModifiedFile
    )
  }

  private onFilterDeletedFiles = () => {
    if (!this.props.fileListFilter.isDeletedFile) {
      this.props.dispatcher.incrementMetric(
        'appliesDeletedFilesChangesFilterCount'
      )
    }
    this.props.dispatcher.setFilterDeletedFiles(
      this.props.repository,
      !this.props.fileListFilter.isDeletedFile
    )
  }

  private onFilterExcludedFiles = () => {
    if (!this.props.fileListFilter.isExcludedFromCommit) {
      this.props.dispatcher.incrementMetric(
        'appliesExcludedFromCommitFilterCount'
      )
    }
    this.props.dispatcher.setFilterExcludedFiles(
      this.props.repository,
      !this.props.fileListFilter.isExcludedFromCommit
    )
  }

  private onClearAllFilters = () => {
    this.props.dispatcher.incrementMetric(
      'appliesClearAllChangesListFilterCount'
    )

    // Clear all filters including text filter
    this.props.dispatcher.setChangesListFilterText(this.props.repository, '')
    this.props.dispatcher.setIncludedChangesInCommitFilter(
      this.props.repository,
      false
    )
    this.props.dispatcher.setFilterExcludedFiles(this.props.repository, false)
    this.props.dispatcher.setFilterNewFiles(this.props.repository, false)
    this.props.dispatcher.setFilterModifiedFiles(this.props.repository, false)
    this.props.dispatcher.setFilterDeletedFiles(this.props.repository, false)
  }

  private onChangedFileFocus = (changeListItem: IChangesListItem) => {
    this.setState({ focusedRow: changeListItem.id })
  }

  private onChangedFileBlur = (changeListItem: IChangesListItem) => {
    if (this.state.focusedRow === changeListItem.id) {
      this.setState({ focusedRow: null })
    }
  }
}
