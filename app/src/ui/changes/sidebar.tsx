import * as Path from 'path'
import * as React from 'react'

import { ChangesList } from './changes-list'
import { DiffSelectionType } from '../../models/diff'
import {
  IChangesState,
  RebaseConflictState,
  isRebaseConflictState,
  ChangesSelectionKind,
} from '../../lib/app-state'
import { Repository } from '../../models/repository'
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
import { WorkingDirectoryFileChange } from '../../models/status'
import { TransitionGroup, CSSTransition } from 'react-transition-group'
import { openFile } from '../lib/open-file'
import { Account } from '../../models/account'
import { PopupType } from '../../models/popup'
import { filesNotTrackedByLFS } from '../../lib/git/lfs'
import { getLargeFilePaths } from '../../lib/large-files'
import { isConflictedFile, hasUnresolvedConflicts } from '../../lib/status'
import { getAccountForRepository } from '../../lib/get-account-for-repository'
import { IAheadBehind } from '../../models/branch'

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
  readonly aheadBehind: IAheadBehind | null
  readonly dispatcher: Dispatcher
  readonly commitAuthor: CommitIdentity | null
  readonly branch: string | null
  readonly emoji: Map<string, string>
  readonly mostRecentLocalCommit: Commit | null
  // Used in receiveProps, no-unused-prop-types doesn't know that
  // eslint-disable-next-line react/no-unused-prop-types
  readonly issuesStore: IssuesStore
  readonly availableWidth: number
  readonly isCommitting: boolean
  readonly commitToAmend: Commit | null
  readonly isPushPullFetchInProgress: boolean
  // Used in receiveProps, no-unused-prop-types doesn't know that
  // eslint-disable-next-line react/no-unused-prop-types
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

  readonly showCommitLengthWarning: boolean
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
      this.props.dispatcher.incrementMetric(
        'unguidedConflictedMergeCompletionCount'
      )
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
   * Called to open a file in the default external editor
   *
   * @param path The path of the file relative to the root of the repository
   */
  private onOpenItemInExternalEditor = (path: string) => {
    this.props.onOpenInExternalEditor(path)
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

  public render() {
    const {
      workingDirectory,
      commitMessage,
      showCoAuthoredBy,
      coAuthors,
      conflictState,
      selection,
      currentBranchProtected,
      currentRepoRulesInfo,
    } = this.props.changes
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

    const isShowingStashEntry = selection.kind === ChangesSelectionKind.Stash
    const repositoryAccount = getAccountForRepository(
      this.props.accounts,
      this.props.repository
    )

    return (
      <div className="panel" role="tabpanel" aria-labelledby="changes-tab">
        <ChangesList
          ref={this.changesListRef}
          dispatcher={this.props.dispatcher}
          repository={this.props.repository}
          repositoryAccount={repositoryAccount}
          workingDirectory={workingDirectory}
          conflictState={conflictState}
          mostRecentLocalCommit={this.props.mostRecentLocalCommit}
          rebaseConflictState={rebaseConflictState}
          selectedFileIDs={selectedFileIDs}
          onFileSelectionChanged={this.onFileSelectionChanged}
          onCreateCommit={this.onCreateCommit}
          onIncludeChanged={this.onIncludeChanged}
          onSelectAll={this.onSelectAll}
          onDiscardChanges={this.onDiscardChanges}
          askForConfirmationOnDiscardChanges={
            this.props.askForConfirmationOnDiscardChanges
          }
          onDiscardChangesFromFiles={this.onDiscardChangesFromFiles}
          onOpenItem={this.onOpenItem}
          onRowClick={this.onChangedItemClick}
          commitAuthor={this.props.commitAuthor}
          branch={this.props.branch}
          commitMessage={commitMessage}
          focusCommitMessage={this.props.focusCommitMessage}
          isShowingModal={this.props.isShowingModal}
          isShowingFoldout={this.props.isShowingFoldout}
          autocompletionProviders={this.autocompletionProviders!}
          availableWidth={this.props.availableWidth}
          onIgnoreFile={this.onIgnoreFile}
          onIgnorePattern={this.onIgnorePattern}
          isCommitting={this.props.isCommitting}
          commitToAmend={this.props.commitToAmend}
          showCoAuthoredBy={showCoAuthoredBy}
          coAuthors={coAuthors}
          externalEditorLabel={this.props.externalEditorLabel}
          onOpenItemInExternalEditor={this.onOpenItemInExternalEditor}
          onChangesListScrolled={this.props.onChangesListScrolled}
          changesListScrollTop={this.props.changesListScrollTop}
          stashEntry={this.props.changes.stashEntry}
          isShowingStashEntry={isShowingStashEntry}
          currentBranchProtected={currentBranchProtected}
          shouldNudgeToCommit={this.props.shouldNudgeToCommit}
          commitSpellcheckEnabled={this.props.commitSpellcheckEnabled}
          showCommitLengthWarning={this.props.showCommitLengthWarning}
          currentRepoRulesInfo={currentRepoRulesInfo}
          aheadBehind={this.props.aheadBehind}
          accounts={this.props.accounts}
        />
        {this.renderUndoCommit(rebaseConflictState)}
      </div>
    )
  }
}
