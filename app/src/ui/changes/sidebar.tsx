import * as Path from 'path'
import * as React from 'react'

import { ChangesList, getIncludeAllValue } from './changes-list'
import { DiffSelectionType } from '../../models/diff'
import {
  IChangesState,
  RebaseConflictState,
  isRebaseConflictState,
  ChangesSelectionKind,
  Foldout,
} from '../../lib/app-state'
import {
  isRepositoryWithGitHubRepository,
  Repository,
} from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { IssuesStore, GitHubUserStore } from '../../lib/stores'
import { CommitIdentity } from '../../models/commit-identity'
import { Commit, ICommitContext } from '../../models/commit'
import { UndoCommit } from './undo-commit'
import {
  buildAutocompletionProviders,
  IAutocompletionProvider,
} from '../autocompletion'
import { ClickSource } from '../lib/list'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
} from '../../models/status'
import { TransitionGroup, CSSTransition } from 'react-transition-group'
import { openFile } from '../lib/open-file'
import { Account } from '../../models/account'
import { Popup, PopupType } from '../../models/popup'
import { filesNotTrackedByLFS } from '../../lib/git/lfs'
import { getLargeFilePaths } from '../../lib/large-files'
import { isConflictedFile, hasUnresolvedConflicts } from '../../lib/status'
import { getAccountForRepository } from '../../lib/get-account-for-repository'
import classNames from 'classnames'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { CommitMessage } from './commit-message'
import { hasWritePermission } from '../../models/github-repository'
import { ContinueRebase } from './continue-rebase'
import { CheckboxValue } from '../lib/checkbox'
import { IAuthor } from '../../models/author'
import { ICommitMessage } from '../../models/commit-message'
import { basename } from 'path'

const StashIcon: OcticonSymbol.OcticonSymbolType = {
  w: 16,
  h: 16,
  d:
    'M10.5 1.286h-9a.214.214 0 0 0-.214.214v9a.214.214 0 0 0 .214.214h9a.214.214 0 0 0 ' +
    '.214-.214v-9a.214.214 0 0 0-.214-.214zM1.5 0h9A1.5 1.5 0 0 1 12 1.5v9a1.5 1.5 0 0 1-1.5 ' +
    '1.5h-9A1.5 1.5 0 0 1 0 10.5v-9A1.5 1.5 0 0 1 1.5 0zm5.712 7.212a1.714 1.714 0 1 ' +
    '1-2.424-2.424 1.714 1.714 0 0 1 2.424 2.424zM2.015 12.71c.102.729.728 1.29 1.485 ' +
    '1.29h9a1.5 1.5 0 0 0 1.5-1.5v-9a1.5 1.5 0 0 0-1.29-1.485v1.442a.216.216 0 0 1 ' +
    '.004.043v9a.214.214 0 0 1-.214.214h-9a.216.216 0 0 1-.043-.004H2.015zm2 2c.102.729.728 ' +
    '1.29 1.485 1.29h9a1.5 1.5 0 0 0 1.5-1.5v-9a1.5 1.5 0 0 0-1.29-1.485v1.442a.216.216 0 0 1 ' +
    '.004.043v9a.214.214 0 0 1-.214.214h-9a.216.216 0 0 1-.043-.004H4.015z',
  fr: 'evenodd',
}

/**
 * The timeout for the animation of the enter/leave animation for Undo.
 *
 * Note that this *must* match the duration specified for the `undo` transitions
 * in `_changes-list.scss`.
 */
const UndoCommitAnimationTimeout = 500

interface IChangesSidebarProps {
  readonly repository: Repository
  readonly changes: IChangesState
  readonly dispatcher: Dispatcher
  readonly commitAuthor: CommitIdentity | null
  readonly branch: string | null
  readonly emoji: Map<string, string>
  readonly mostRecentLocalCommit: Commit | null
  readonly issuesStore: IssuesStore
  readonly availableWidth: number
  readonly isCommitting: boolean
  readonly commitToAmend: Commit | null
  readonly isPushPullFetchInProgress: boolean
  readonly gitHubUserStore: GitHubUserStore
  readonly focusCommitMessage: boolean
  readonly askForConfirmationOnDiscardChanges: boolean
  readonly accounts: ReadonlyArray<Account>
  readonly isShowingModal: boolean
  readonly isShowingFoldout: boolean
  /** The name of the currently selected external editor */
  readonly externalEditorLabel?: string

  /**
   * Callback to open a selected file using the configured external editor
   *
   * @param fullPath The full path to the file on disk
   */
  readonly onOpenInExternalEditor: (fullPath: string) => void
  readonly onChangesListScrolled: (scrollTop: number) => void
  readonly changesListScrollTop?: number

  /**
   * Whether we should show the onboarding tutorial nudge
   * arrow pointing at the commit summary box
   */
  readonly shouldNudgeToCommit: boolean

  readonly commitSpellcheckEnabled: boolean
}

export class ChangesSidebar extends React.Component<IChangesSidebarProps, {}> {
  private autocompletionProviders: ReadonlyArray<
    IAutocompletionProvider<any>
  > | null = null
  private changesListRef = React.createRef<ChangesList>()

  public constructor(props: IChangesSidebarProps) {
    super(props)

    this.receiveProps(props)
  }

  public componentWillReceiveProps(nextProps: IChangesSidebarProps) {
    this.receiveProps(nextProps)
  }

  private receiveProps(props: IChangesSidebarProps) {
    if (
      this.autocompletionProviders === null ||
      this.props.emoji.size === 0 ||
      props.repository.hash !== this.props.repository.hash ||
      props.accounts !== this.props.accounts
    ) {
      this.autocompletionProviders = buildAutocompletionProviders(
        props.repository,
        props.dispatcher,
        props.emoji,
        props.issuesStore,
        props.gitHubUserStore,
        props.accounts
      )
    }
  }

  private onCreateCommit = async (
    context: ICommitContext
  ): Promise<boolean> => {
    const { workingDirectory } = this.props.changes

    const overSizedFiles = await getLargeFilePaths(
      this.props.repository,
      workingDirectory
    )

    const filesIgnoredByLFS = await filesNotTrackedByLFS(
      this.props.repository,
      overSizedFiles
    )

    if (filesIgnoredByLFS.length !== 0) {
      this.props.dispatcher.showPopup({
        type: PopupType.OversizedFiles,
        oversizedFiles: filesIgnoredByLFS,
        context: context,
        repository: this.props.repository,
      })

      return false
    }

    // are any conflicted files left?
    const conflictedFilesLeft = workingDirectory.files.filter(
      f =>
        isConflictedFile(f.status) &&
        f.selection.getSelectionType() === DiffSelectionType.None
    )

    if (conflictedFilesLeft.length === 0) {
      this.props.dispatcher.clearBanner()
      this.props.dispatcher.recordUnguidedConflictedMergeCompletion()
    }

    // which of the files selected for committing are conflicted (with markers)?
    const conflictedFilesSelected = workingDirectory.files.filter(
      f =>
        isConflictedFile(f.status) &&
        hasUnresolvedConflicts(f.status) &&
        f.selection.getSelectionType() !== DiffSelectionType.None
    )

    if (conflictedFilesSelected.length > 0) {
      this.props.dispatcher.showPopup({
        type: PopupType.CommitConflictsWarning,
        files: conflictedFilesSelected,
        repository: this.props.repository,
        context,
      })
      return false
    }

    return this.props.dispatcher.commitIncludedChanges(
      this.props.repository,
      context
    )
  }

  private onFileSelectionChanged = (rows: ReadonlyArray<number>) => {
    const files = rows.map(i => this.props.changes.workingDirectory.files[i])
    this.props.dispatcher.selectWorkingDirectoryFiles(
      this.props.repository,
      files
    )
  }

  private onIncludeChanged = (path: string, include: boolean) => {
    const workingDirectory = this.props.changes.workingDirectory
    const file = workingDirectory.files.find(f => f.path === path)
    if (!file) {
      console.error(
        'unable to find working directory file to apply included change: ' +
          path
      )
      return
    }

    this.props.dispatcher.changeFileIncluded(
      this.props.repository,
      file,
      include
    )
  }

  private onSelectAll = (selectAll: boolean) => {
    this.props.dispatcher.changeIncludeAllFiles(
      this.props.repository,
      selectAll
    )
  }

  private onDiscardChanges = (file: WorkingDirectoryFileChange) => {
    if (!this.props.askForConfirmationOnDiscardChanges) {
      this.props.dispatcher.discardChanges(this.props.repository, [file])
    } else {
      this.props.dispatcher.showPopup({
        type: PopupType.ConfirmDiscardChanges,
        repository: this.props.repository,
        files: [file],
      })
    }
  }

  private onDiscardChangesFromFiles = (
    files: ReadonlyArray<WorkingDirectoryFileChange>,
    isDiscardingAllChanges: boolean
  ) => {
    this.props.dispatcher.showPopup({
      type: PopupType.ConfirmDiscardChanges,
      repository: this.props.repository,
      showDiscardChangesSetting: false,
      discardingAllChanges: isDiscardingAllChanges,
      files,
    })
  }

  private onIgnoreFile = (file: string | string[]) => {
    this.props.dispatcher.appendIgnoreFile(this.props.repository, file)
  }

  private onIgnorePattern = (pattern: string | string[]) => {
    this.props.dispatcher.appendIgnoreRule(this.props.repository, pattern)
  }

  /**
   * Open file with default application.
   *
   * @param path The path of the file relative to the root of the repository
   */
  private onOpenItem = (path: string) => {
    const fullPath = Path.join(this.props.repository.path, path)
    openFile(fullPath, this.props.dispatcher)
  }

  /**
   * Toggles the selection of a given working directory file.
   * If the file is partially selected it the selection is cleared
   * in order to match the behavior of clicking on an indeterminate
   * checkbox.
   */
  private onToggleInclude(row: number) {
    const workingDirectory = this.props.changes.workingDirectory
    const file = workingDirectory.files[row]

    if (!file) {
      console.error('keyboard selection toggle despite no file - what?')
      return
    }

    const currentSelection = file.selection.getSelectionType()

    this.props.dispatcher.changeFileIncluded(
      this.props.repository,
      file,
      currentSelection === DiffSelectionType.None
    )
  }

  /**
   * Handles click events from the List item container, note that this is
   * Not the same thing as the element returned by the row renderer in ChangesList
   */
  private onChangedItemClick = (
    rows: number | number[],
    source: ClickSource
  ) => {
    // Toggle selection when user presses the spacebar or enter while focused
    // on a list item or on the list's container
    if (source.kind === 'keyboard') {
      if (rows instanceof Array) {
        rows.forEach(row => this.onToggleInclude(row))
      } else {
        this.onToggleInclude(rows)
      }
    }
  }

  private onUndo = () => {
    const commit = this.props.mostRecentLocalCommit

    if (commit && commit.tags.length === 0) {
      this.props.dispatcher.undoCommit(this.props.repository, commit)
    }
  }

  private renderMostRecentLocalCommit() {
    const commit = this.props.mostRecentLocalCommit
    let child: JSX.Element | null = null

    // We don't allow undoing commits that have tags associated to them, since then
    // the commit won't be completely deleted because the tag will still point to it.
    // Also, don't allow undoing commits while the user is amending the last one.
    if (
      commit &&
      commit.tags.length === 0 &&
      this.props.commitToAmend === null
    ) {
      child = (
        <CSSTransition
          classNames="undo"
          appear={true}
          timeout={UndoCommitAnimationTimeout}
        >
          <UndoCommit
            isPushPullFetchInProgress={this.props.isPushPullFetchInProgress}
            commit={commit}
            onUndo={this.onUndo}
            emoji={this.props.emoji}
            isCommitting={this.props.isCommitting}
          />
        </CSSTransition>
      )
    }

    return <TransitionGroup>{child}</TransitionGroup>
  }

  private renderUndoCommit = (
    rebaseConflictState: RebaseConflictState | null
  ): JSX.Element | null => {
    if (rebaseConflictState !== null) {
      return null
    }

    return this.renderMostRecentLocalCommit()
  }

  public focus() {
    this.changesListRef.current?.focus()
  }

  private onCoAuthorsUpdated = (coAuthors: ReadonlyArray<IAuthor>) =>
    this.props.dispatcher.setCoAuthors(this.props.repository, coAuthors)

  private onShowCoAuthoredByChanged = (showCoAuthors: boolean) => {
    const { dispatcher, repository } = this.props
    dispatcher.setShowCoAuthoredBy(repository, showCoAuthors)
  }

  private onRefreshAuthor = () =>
    this.props.dispatcher.refreshAuthor(this.props.repository)

  private onCommitMessageFocusSet = () =>
    this.props.dispatcher.setCommitMessageFocus(false)

  private onPersistCommitMessage = (message: ICommitMessage) =>
    this.props.dispatcher.setCommitMessage(this.props.repository, message)

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

  private renderCommitMessageForm = (): JSX.Element => {
    const { repository, dispatcher, changes, isCommitting, commitToAmend } =
      this.props
    const {
      workingDirectory,
      commitMessage,
      showCoAuthoredBy,
      coAuthors,
      conflictState,
      currentBranchProtected,
    } = changes

    let rebaseConflictState: RebaseConflictState | null = null
    if (conflictState !== null) {
      rebaseConflictState = isRebaseConflictState(conflictState)
        ? conflictState
        : null
    }

    const repositoryAccount = getAccountForRepository(
      this.props.accounts,
      this.props.repository
    )

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

    const includeAllValue = getIncludeAllValue(
      workingDirectory,
      rebaseConflictState
    )

    const anyFilesSelected =
      fileCount > 0 && includeAllValue !== CheckboxValue.Off

    const filesSelected = workingDirectory.files.filter(
      f => f.selection.getSelectionType() !== DiffSelectionType.None
    )

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

    return (
      <CommitMessage
        onCreateCommit={this.onCreateCommit}
        branch={this.props.branch}
        mostRecentLocalCommit={this.props.mostRecentLocalCommit}
        commitAuthor={this.props.commitAuthor}
        isShowingModal={this.props.isShowingModal}
        isShowingFoldout={this.props.isShowingFoldout}
        anyFilesSelected={anyFilesSelected}
        anyFilesAvailable={fileCount > 0}
        repository={repository}
        repositoryAccount={repositoryAccount}
        commitMessage={commitMessage}
        focusCommitMessage={this.props.focusCommitMessage}
        autocompletionProviders={this.autocompletionProviders!}
        isCommitting={isCommitting}
        commitToAmend={commitToAmend}
        showCoAuthoredBy={showCoAuthoredBy}
        coAuthors={coAuthors}
        placeholder={this.getPlaceholderMessage(
          filesSelected,
          prepopulateCommitSummary
        )}
        prepopulateCommitSummary={prepopulateCommitSummary}
        key={repository.id}
        showBranchProtected={fileCount > 0 && currentBranchProtected}
        showNoWriteAccess={fileCount > 0 && !hasWritePermissionForRepository}
        shouldNudge={this.props.shouldNudgeToCommit}
        commitSpellcheckEnabled={this.props.commitSpellcheckEnabled}
        onCoAuthorsUpdated={this.onCoAuthorsUpdated}
        onShowCoAuthoredByChanged={this.onShowCoAuthoredByChanged}
        onPersistCommitMessage={this.onPersistCommitMessage}
        onCommitMessageFocusSet={this.onCommitMessageFocusSet}
        onRefreshAuthor={this.onRefreshAuthor}
        onShowPopup={this.onShowPopup}
        onShowFoldout={this.onShowFoldout}
        onCommitSpellcheckEnabledChanged={this.onCommitSpellcheckEnabledChanged}
        onStopAmending={this.onStopAmending}
        onShowCreateForkDialog={this.onShowCreateForkDialog}
      />
    )
  }

  private onStashEntryClicked = () => {
    const { changes, dispatcher, repository } = this.props
    const { selection } = changes
    const isShowingStashEntry = selection.kind === ChangesSelectionKind.Stash

    if (isShowingStashEntry) {
      dispatcher.selectWorkingDirectoryFiles(repository)

      // If the button is clicked, that implies the stash was not restored or discarded
      dispatcher.recordNoActionTakenOnStash()
    } else {
      dispatcher.selectStashedFile(repository)
      dispatcher.recordStashView()
    }
  }

  private renderStashedChanges() {
    const { selection, stashEntry } = this.props.changes
    const isShowingStashEntry = selection.kind === ChangesSelectionKind.Stash

    if (stashEntry === null) {
      return null
    }

    const className = classNames(
      'stashed-changes-button',
      isShowingStashEntry ? 'selected' : null
    )

    return (
      <button
        className={className}
        onClick={this.onStashEntryClicked}
        tabIndex={0}
      >
        <Octicon className="stack-icon" symbol={StashIcon} />
        <div className="text">Stashed Changes</div>
        <Octicon symbol={OcticonSymbol.chevronRight} />
      </button>
    )
  }

  public render() {
    const { workingDirectory, conflictState, selection } = this.props.changes
    let rebaseConflictState: RebaseConflictState | null = null
    if (conflictState !== null) {
      rebaseConflictState = isRebaseConflictState(conflictState)
        ? conflictState
        : null
    }

    const selectedFileIDs =
      selection.kind === ChangesSelectionKind.WorkingDirectory
        ? selection.selectedFileIDs
        : []

    return (
      <div className="panel">
        <ChangesList
          ref={this.changesListRef}
          dispatcher={this.props.dispatcher}
          repository={this.props.repository}
          workingDirectory={workingDirectory}
          conflictState={conflictState}
          rebaseConflictState={rebaseConflictState}
          selectedFileIDs={selectedFileIDs}
          onFileSelectionChanged={this.onFileSelectionChanged}
          onIncludeChanged={this.onIncludeChanged}
          onSelectAll={this.onSelectAll}
          onDiscardChanges={this.onDiscardChanges}
          askForConfirmationOnDiscardChanges={
            this.props.askForConfirmationOnDiscardChanges
          }
          onDiscardChangesFromFiles={this.onDiscardChangesFromFiles}
          onOpenItem={this.onOpenItem}
          onRowClick={this.onChangedItemClick}
          branch={this.props.branch}
          availableWidth={this.props.availableWidth}
          onIgnoreFile={this.onIgnoreFile}
          onIgnorePattern={this.onIgnorePattern}
          isCommitting={this.props.isCommitting}
          externalEditorLabel={this.props.externalEditorLabel}
          onOpenInExternalEditor={this.props.onOpenInExternalEditor}
          onChangesListScrolled={this.props.onChangesListScrolled}
          changesListScrollTop={this.props.changesListScrollTop}
          stashEntry={this.props.changes.stashEntry}
        />
        <div className="changes-list-footer">
          {this.renderStashedChanges()}
          {this.renderCommitMessageForm()}
          {this.renderUndoCommit(rebaseConflictState)}
        </div>
      </div>
    )
  }
}
