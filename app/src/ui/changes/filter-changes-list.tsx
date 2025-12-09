import * as React from 'react'
import * as Path from 'path'

import { Dispatcher } from '../dispatcher'
import { IMenuItem } from '../../lib/menu-item'
import { revealInFileManager } from '../../lib/app-shell'
import { encodePathAsUrl } from '../../lib/path'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  AppFileStatusKind,
} from '../../models/status'
import { DiffSelectionType } from '../../models/diff'
import { CommitIdentity } from '../../models/commit-identity'
import { ICommitMessage } from '../../models/commit-message'
import {
  isRepositoryWithGitHubRepository,
  Repository,
} from '../../models/repository'
import { Account } from '../../models/account'
import { Author, UnknownAuthor } from '../../models/author'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { IFileListFilterState } from '../../lib/app-state'
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
import { hasConflictedFiles } from '../../lib/status'
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
import { IMatches } from '../../lib/fuzzy-find'
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

export interface IChangesListItem extends IFilterListItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
  readonly change: WorkingDirectoryFileChange
}

const RowHeight = 29
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
  readonly mostRecentLocalCommit: Commit | null
  /**
   * An object containing the conflicts in the working directory.
   * When null it means that there are no conflicts.
   */
  readonly conflictState: ConflictState | null
  readonly rebaseConflictState: RebaseConflictState | null
  readonly selectedFileIDs: ReadonlyArray<string>
  readonly onFileSelectionChanged: (rows: ReadonlyArray<number>) => void
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
  readonly onChangesListScrolled: (scrollTop: number) => void

  /* The scrollTop of the compareList. It is stored to allow for scroll position persistence */
  readonly changesListScrollTop?: number

  /**
   * Called to open a file in its default application
   *
   * @param path The path of the file relative to the root of the repository
   */
  readonly onOpenItem: (path: string) => void

  /**
   * Called to open a file in the default external editor
   *
   * @param path The path of the file relative to the root of the repository
   */
  readonly onOpenItemInExternalEditor: (path: string) => void

  /**
   * Called to open a file in the Code tab
   *
   * @param path The path of the file relative to the root of the repository
   */
  readonly onOpenItemInCodeTab?: (path: string) => void

  /**
   * The currently checked out branch (null if no branch is checked out).
   */
  readonly branch: string | null
  readonly commitAuthor: CommitIdentity | null
  readonly dispatcher: Dispatcher
  readonly availableWidth: number
  readonly isCommitting: boolean
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
}

interface IFilterChangesListState {
  readonly filteredItems: Map<string, IChangesListItem>
  readonly selectedItems: ReadonlyArray<IChangesListItem>
  readonly focusedRow: string | null
  readonly groups: ReadonlyArray<IFilterListGroup<IChangesListItem>>
}

function getSelectedItemsFromProps(
  props: IFilterChangesListProps
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

    selectedItems.push({
      text: [file.path, file.status.kind.toString()],
      id: file.id,
      change: file,
    })
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
  private filterTextBox: TextBox | undefined = undefined
  private headerRef = createObservableRef<HTMLDivElement>()
  private filterOptionsButtonRef: HTMLButtonElement | null = null
  private includeAllCheckBoxRef = React.createRef<Checkbox>()
  private filterListRef =
    React.createRef<AugmentedSectionFilterList<IChangesListItem>>()

  /** Compute the 'Include All' checkbox value */
  private getCheckAllValue = memoizeOne(
    (
      workingDirectory: WorkingDirectoryStatus,
      rebaseConflictState: RebaseConflictState | null,
      filteredItems: Map<string, IChangesListItem>
    ): CheckboxValue => {
      if (
        filteredItems.size === workingDirectory.files.length &&
        rebaseConflictState === null
      ) {
        return getCheckBoxValueFromIncludeAll(workingDirectory.includeAll)
      }

      const files = workingDirectory.files.filter(f => filteredItems.has(f.id))

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

    const listItems = this.createListItems(props.workingDirectory.files)
    const groups = [listItems]

    this.state = {
      filteredItems: new Map<string, IChangesListItem>(
        listItems.items.map(i => [i.id, i])
      ),
      selectedItems: getSelectedItemsFromProps(props),
      focusedRow: null,
      groups,
    }
  }

  public componentWillReceiveProps(nextProps: IFilterChangesListProps) {
    // No need to update state unless we haven't done it yet or the
    // selected file id list has changed.
    if (
      !arrayEquals(nextProps.selectedFileIDs, this.props.selectedFileIDs) ||
      !arrayEquals(
        nextProps.workingDirectory.files,
        this.props.workingDirectory.files
      )
    ) {
      this.setState({
        selectedItems: getSelectedItemsFromProps(nextProps),
        groups: [this.createListItems(nextProps.workingDirectory.files)],
      })
    }
  }

  private createListItems(
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ): IFilterListGroup<IChangesListItem> {
    const items = files.map(file => ({
      text: [file.path],
      id: file.id,
      change: file,
    }))

    return {
      identifier: 'changed-files',
      items,
    }
  }

  private onIncludeAllChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const include = event.currentTarget.checked
    const filteredItemPaths = Array.from(
      this.state.filteredItems,
      ([, v]) => v.change
    )
    this.props.onIncludeChanged(filteredItemPaths, include)
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
    const { submoduleStatus } = file.status

    const isUncommittableSubmodule =
      submoduleStatus !== undefined &&
      file.status.kind === AppFileStatusKind.Modified &&
      !submoduleStatus.commitChanged

    const isPartiallyCommittableSubmodule =
      submoduleStatus !== undefined &&
      (submoduleStatus.commitChanged ||
        file.status.kind === AppFileStatusKind.New) &&
      (submoduleStatus.modifiedChanges || submoduleStatus.untrackedChanges)

    const includeAll =
      selection === DiffSelectionType.All
        ? true
        : selection === DiffSelectionType.None
        ? false
        : null

    const include = isUncommittableSubmodule
      ? false
      : rebaseConflictState !== null
      ? file.status.kind !== AppFileStatusKind.Untracked
      : includeAll

    const disableSelection =
      isCommitting || rebaseConflictState !== null || isUncommittableSubmodule

    const checkboxTooltip = isUncommittableSubmodule
      ? 'This submodule change cannot be added to a commit in this repository because it contains changes that have not been committed.'
      : isPartiallyCommittableSubmodule
      ? 'Only changes that have been committed within the submodule will be added to this repository. You need to commit any other modified or untracked changes in the submodule before including them in this repository.'
      : undefined

    return (
      <ChangedFile
        file={file}
        include={isPartiallyCommittableSubmodule && include ? null : include}
        key={file.id}
        onIncludeChanged={onIncludeChanged}
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
    file: WorkingDirectoryFileChange
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

    if (paths.length > 1) {
      items.push(
        { type: 'separator' },
        {
          label: __DARWIN__
            ? 'Include Selected Files'
            : 'Include selected files',
          action: () => {
            selectedFiles.map(file => this.props.onIncludeChanged(file, true))
          },
        },
        {
          label: __DARWIN__
            ? 'Exclude Selected Files'
            : 'Exclude selected files',
          action: () => {
            selectedFiles.map(file => this.props.onIncludeChanged(file, false))
          },
        },
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
        ? this.getDefaultContextMenu(file)
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
    this.props.onChangesListScrolled(scrollTop)
  }

  private renderCommitMessageForm = (): JSX.Element => {
    const {
      rebaseConflictState,
      workingDirectory,
      repository,
      repositoryAccount,
      dispatcher,
      isCommitting,
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
    const filesSelected = workingDirectory.files.filter(
      f => f.selection.getSelectionType() !== DiffSelectionType.None
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
    // Open in Code tab if available, otherwise fall back to external editor
    if (this.props.onOpenItemInCodeTab) {
      this.props.onOpenItemInCodeTab(item.change.path)
    } else {
      this.props.onOpenItemInExternalEditor(item.change.path)
    }
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

  private onFilterListResultsChanged = (
    filteredItems: ReadonlyArray<IChangesListItem>
  ) => {
    const filteredSet = new Map<string, IChangesListItem>()
    filteredItems.forEach(f => filteredSet.set(f.id, f))
    this.setState({ filteredItems: filteredSet })
  }

  private onFileSelectionChanged = (items: ReadonlyArray<IChangesListItem>) => {
    const rows = items.map(i =>
      this.props.workingDirectory.findFileIndexByID(i.change.id)
    )
    this.props.onFileSelectionChanged(rows)
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
    if (this.filterListRef.current) {
      this.filterListRef.current.onKeyDown(event)
    }
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

    const visibleFiles = this.state.filteredItems.size

    const includeAllValue = this.getCheckAllValue(
      workingDirectory,
      rebaseConflictState,
      this.state.filteredItems
    )

    const disableAllCheckbox =
      files.length === 0 || isCommitting || rebaseConflictState !== null

    const checkAllLabel = `${
      visibleFiles !== files.length ? `${visibleFiles} of ` : ''
    }
    ${files.length} changed file${plural(files.length)}`

    return (
      <div className="checkbox-container">
        <Checkbox
          ref={this.includeAllCheckBoxRef}
          value={includeAllValue}
          onChange={this.onIncludeAllChanged}
          disabled={disableAllCheckbox}
          ariaLabelledBy="changes-list-check-all-label"
          className="changes-list-check-all"
          label={checkAllLabel}
        />
      </div>
    )
  }

  private renderFilterBox = () => {
    if (!this.props.showChangesFilter) {
      return null
    }

    return (
      <div className="filter-box-container">
        <span>
          <ChangesListFilterOptions
            fileListFilter={this.props.fileListFilter}
            filteredItems={this.state.filteredItems}
            onFilterToIncludedInCommit={this.onFilterToIncludedInCommit}
            onFilterExcludedFiles={this.onFilterExcludedFiles}
            onFilterDeletedFiles={this.onFilterDeletedFiles}
            onFilterModifiedFiles={this.onFilterModifiedFiles}
            onFilterNewFiles={this.onFilterNewFiles}
            onClearAllFilters={this.onClearAllFilters}
            workingDirectory={this.props.workingDirectory}
          />
        </span>
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
    )
  }

  private applyFilters = (item: IChangesListItem) => {
    return applyFilters(
      item,
      this.props.showChangesFilter,
      this.props.fileListFilter
    )
  }

  private getListAriaLabel = () => {
    const { files } = this.props.workingDirectory
    return `${files.length} changed file${plural(files.length)}`
  }

  public render() {
    const { workingDirectory, isCommitting } = this.props

    return (
      <>
        <div className="changes-list-container file-list filtered-changes-list">
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
            onFilterListResultsChanged={this.onFilterListResultsChanged}
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
            filterMethod={
              this.props.fileListFilter.isIncludedInCommit ||
              this.props.fileListFilter.isNewFile ||
              this.props.fileListFilter.isModifiedFile ||
              this.props.fileListFilter.isDeletedFile ||
              this.props.fileListFilter.isExcludedFromCommit
                ? this.applyFilters
                : undefined
            }
            invalidationProps={{
              workingDirectory: workingDirectory,
              isCommitting: isCommitting,
              focusedRow: this.state.focusedRow,
              showChangesFilter: this.props.showChangesFilter,
              filterNewFiles: this.props.fileListFilter.isNewFile,
              filterModifiedFiles: this.props.fileListFilter.isModifiedFile,
              filterDeletedFiles: this.props.fileListFilter.isDeletedFile,
              filterExcludedFiles:
                this.props.fileListFilter.isExcludedFromCommit,
            }}
            onItemContextMenu={this.onItemContextMenu}
            renderCustomFilterRow={this.renderFilterRow}
            getGroupAriaLabel={this.getListAriaLabel}
            renderNoItems={this.renderNoChanges}
            postNoResultsMessage={getNoResultsMessage(
              this.props.fileListFilter
            )}
          />
        </div>
        {this.renderStashedChanges()}
        {this.renderHiddenChangesWarning()}
        {this.renderCommitMessageForm()}
      </>
    )
  }

  private renderHiddenChangesWarning = () => {
    const { files } = this.props.workingDirectory
    const filesSelected = files.filter(
      f => f.selection.getSelectionType() !== DiffSelectionType.None
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
          Adjust the filters to see all {filesSelected.length} changes
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
