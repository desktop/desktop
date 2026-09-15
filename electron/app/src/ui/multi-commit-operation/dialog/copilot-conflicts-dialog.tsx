import * as React from 'react'
import { join } from 'path'
import { Dialog, DialogContent, DialogFooter } from '../../dialog'
import { DialogHeader } from '../../dialog/header'
import { Dispatcher } from '../../dispatcher'
import { Emoji } from '../../../lib/emoji'
import { Repository } from '../../../models/repository'
import { MultiCommitOperationStepKind } from '../../../models/multi-commit-operation'
import { MultiCommitOperationConflictState } from '../../../lib/app-state'
import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  isConflictWithMarkers,
  isManualConflict,
} from '../../../models/status'
import { getUnmergedFiles, isConflictedFile } from '../../../lib/status'
import { assertNever } from '../../../lib/fatal-error'
import { ManualConflictResolution } from '../../../models/manual-conflict-resolution'
import {
  IFileResolution,
  ICopilotResolutionSummary,
  ICopilotSkippedFile,
} from '../../../lib/copilot-conflict-resolution'
import { IConflictResolutionModelDisplay } from '../../../lib/copilot/conflict-resolution-model'
import { formatReasoningEffort } from '../../../lib/stores/copilot-store'
import { showContextualMenu, IMenuItem } from '../../../lib/menu-item'
import { OkCancelButtonGroup } from '../../dialog/ok-cancel-button-group'
import { Button } from '../../lib/button'
import { Octicon } from '../../octicons'
import * as octicons from '../../octicons/octicons.generated'
import { PathText } from '../../lib/path-text'
import {
  OpenWithDefaultProgramLabel,
  RevealInFileManagerLabel,
} from '../../lib/context-menu'
import { openFile } from '../../lib/open-file'
import { revealInFileManager } from '../../../lib/app-shell'
import { CopilotConflictsResolutionSummary } from './copilot-conflicts-resolution-summary'
import { PopupType } from '../../../models/popup'
import { PreferencesTab } from '../../../models/preferences'
import { MultiCommitOperationKind } from '../../../models/multi-commit-operation'
import { TabBar, TabBarType } from '../../tab-bar'
import { CopilotConflictsChanges } from './copilot-conflicts-changes'

import {
  CopilotFileResolutionChoice,
  getResolutionChoiceForFile,
  resolutionChoices,
  isDeleteConflictFile,
  getDeletedSide,
  getDeleteConflictChoiceLabel,
  getOursTheirsLabels,
} from './copilot-resolution-helpers'

interface ICopilotConflictsDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly conflictState: MultiCommitOperationConflictState
  readonly workingDirectory: WorkingDirectoryStatus
  readonly operationKind: MultiCommitOperationKind
  readonly copilotResolutions: ReadonlyArray<IFileResolution> | null
  readonly copilotResolutionSummary: ICopilotResolutionSummary | null
  readonly copilotSkippedFiles: ReadonlyArray<ICopilotSkippedFile> | null
  readonly model: IConflictResolutionModelDisplay
  readonly resolvedExternalEditor: string | null
  readonly openFileInExternalEditor: (path: string) => void
  readonly onContinueAfterConflicts: () => Promise<void>
  readonly onAbort: () => Promise<void>
  readonly onDismissed: () => void
  readonly emoji: Map<string, Emoji>
}

enum CopilotConflictsTab {
  Summary,
  Changes,
}

interface ICopilotConflictsDialogState {
  readonly isContinuing: boolean
  readonly selectedTab: CopilotConflictsTab
}

const CopilotConflictsDialogTitleId = 'Dialog_Copilot_Conflicts'

/**
 * Dialog shown after Copilot has resolved conflicts.
 *
 * Displays the list of conflicted files with Copilot resolution indicators,
 * per-file reasoning, and resolution choice dropdowns. Allows the user to
 * continue the operation or go back to manual resolution.
 */
export class CopilotConflictsDialog extends React.Component<
  ICopilotConflictsDialogProps,
  ICopilotConflictsDialogState
> {
  private readonly dropdownHandlers = new Map<string, () => void>()
  private readonly overflowHandlers = new Map<string, () => void>()
  private readonly skippedDropdownHandlers = new Map<string, () => void>()

  public constructor(props: ICopilotConflictsDialogProps) {
    super(props)
    this.state = {
      isContinuing: false,
      selectedTab: CopilotConflictsTab.Summary,
    }
  }

  private onBackToManual = () => {
    const { dispatcher, repository, conflictState } = this.props

    dispatcher.setMultiCommitOperationStepWithCopilotResolution(
      repository,
      {
        kind: MultiCommitOperationStepKind.ShowConflicts,
        conflictState,
      },
      false
    )
  }

  private onOpenCopilotSettings = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.Preferences,
      initialSelectedTab: PreferencesTab.Copilot,
    })
  }

  private onContinue = async () => {
    this.setState({ isContinuing: true })
    try {
      // Write Copilot resolutions to disk before continuing the operation.
      // Done here (shared) so it works for merge, rebase, and cherry-pick.
      await this.props.dispatcher.applyCopilotConflictResolutions(
        this.props.repository
      )
      await this.props.onContinueAfterConflicts()
    } catch (e) {
      this.setState({ isContinuing: false })
      throw e
    }
  }

  private onAbort = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    await this.props.onAbort()
  }

  private getResolutionForFile(path: string): CopilotFileResolutionChoice {
    return getResolutionChoiceForFile(
      path,
      this.props.conflictState.manualResolutions
    )
  }

  private onResolutionDropdownClick = (path: string) => {
    const currentChoice = this.getResolutionForFile(path)
    const { ourBranch, theirBranch } = this.props.conflictState
    const fileStatus = this.getConflictedFileStatus(path)
    const { oursLabel, theirsLabel } = getOursTheirsLabels(
      fileStatus,
      ourBranch,
      theirBranch
    )

    const items: ReadonlyArray<IMenuItem> = [
      {
        label: "Use Copilot's suggestion",
        type: 'checkbox',
        checked: currentChoice === 'copilot',
        action: () => this.setResolution(path, 'copilot'),
      },
      {
        label: oursLabel,
        type: 'checkbox',
        checked: currentChoice === 'ours',
        action: () => this.setResolution(path, 'ours'),
      },
      {
        label: theirsLabel,
        type: 'checkbox',
        checked: currentChoice === 'theirs',
        action: () => this.setResolution(path, 'theirs'),
      },
    ]

    showContextualMenu(items)
  }

  private setResolution(
    path: string,
    choice: CopilotFileResolutionChoice
  ): void {
    const { dispatcher, repository } = this.props

    if (choice === 'copilot') {
      dispatcher.updateManualConflictResolution(repository, path, null)
    } else if (choice === 'ours') {
      dispatcher.updateManualConflictResolution(
        repository,
        path,
        ManualConflictResolution.ours
      )
    } else {
      dispatcher.updateManualConflictResolution(
        repository,
        path,
        ManualConflictResolution.theirs
      )
    }
  }

  private onOverflowMenuClick = (path: string) => {
    const { repository, dispatcher, resolvedExternalEditor } = this.props
    const absolutePath = join(repository.path, path)

    const items: IMenuItem[] = []

    if (resolvedExternalEditor !== null) {
      items.push({
        label: `Open in ${resolvedExternalEditor}`,
        action: () => this.props.openFileInExternalEditor(absolutePath),
      })
    }

    items.push(
      {
        label: OpenWithDefaultProgramLabel,
        action: () => openFile(absolutePath, dispatcher),
      },
      {
        label: RevealInFileManagerLabel,
        action: () => revealInFileManager(repository, path),
      }
    )

    showContextualMenu(items)
  }

  private getResolutionDropdownClickHandler(path: string): () => void {
    let handler = this.dropdownHandlers.get(path)
    if (handler === undefined) {
      handler = () => this.onResolutionDropdownClick(path)
      this.dropdownHandlers.set(path, handler)
    }
    return handler
  }

  private getOverflowMenuClickHandler(path: string): () => void {
    let handler = this.overflowHandlers.get(path)
    if (handler === undefined) {
      handler = () => this.onOverflowMenuClick(path)
      this.overflowHandlers.set(path, handler)
    }
    return handler
  }

  private getResolutionForPath(path: string): IFileResolution | undefined {
    return this.props.copilotResolutions?.find(r => r.path === path)
  }

  private get skippedFiles(): ReadonlyArray<ICopilotSkippedFile> {
    return this.props.copilotSkippedFiles ?? []
  }

  private get skippedPaths(): ReadonlySet<string> {
    return new Set(this.skippedFiles.map(f => f.path))
  }

  /**
   * The manual (Current/Incoming) choice a user has picked for a skipped file,
   * or undefined when they haven't chosen one yet. Skipped files have no
   * Copilot resolution, so the choice starts unselected.
   */
  private getSkippedFileChoice(path: string): 'ours' | 'theirs' | undefined {
    const manual = this.props.conflictState.manualResolutions.get(path)
    if (manual === ManualConflictResolution.ours) {
      return 'ours'
    }
    if (manual === ManualConflictResolution.theirs) {
      return 'theirs'
    }
    return undefined
  }

  /**
   * Whether a file Copilot skipped now counts as resolved. A skipped file is
   * resolved when the user either picked a side from its dropdown or resolved
   * it themselves in an editor (removing every conflict marker). The latter
   * reuses `isFileResolvedExternally` so skipped files behave exactly like the
   * files in the main conflicted list.
   */
  private isSkippedFileResolved(path: string): boolean {
    if (this.getSkippedFileChoice(path) !== undefined) {
      return true
    }
    const file = this.props.workingDirectory.files.find(f => f.path === path)
    // Gone from the working directory, or no longer reported as conflicted,
    // means the file was resolved/staged externally - there is nothing left to
    // gate Continue on, so treat it as resolved.
    if (file === undefined || !isConflictedFile(file.status)) {
      return true
    }
    // Still conflicted: resolved only once the markers are removed in an editor.
    return this.isFileResolvedExternally(file)
  }

  /**
   * Whether any file Copilot skipped still lacks a resolution. Continue must
   * stay disabled while this is true, otherwise the file would be committed
   * with its conflict markers intact.
   */
  private hasUnresolvedSkippedFiles(): boolean {
    return this.skippedFiles.some(f => !this.isSkippedFileResolved(f.path))
  }

  private onSkippedResolutionDropdownClick = (path: string) => {
    const { ourBranch, theirBranch } = this.props.conflictState
    const fileStatus = this.getConflictedFileStatus(path)
    const { oursLabel, theirsLabel } = getOursTheirsLabels(
      fileStatus,
      ourBranch,
      theirBranch
    )
    const currentChoice = this.getSkippedFileChoice(path)

    const items: ReadonlyArray<IMenuItem> = [
      {
        label: oursLabel,
        type: 'checkbox',
        checked: currentChoice === 'ours',
        action: () => this.setResolution(path, 'ours'),
      },
      {
        label: theirsLabel,
        type: 'checkbox',
        checked: currentChoice === 'theirs',
        action: () => this.setResolution(path, 'theirs'),
      },
    ]

    showContextualMenu(items)
  }

  private getSkippedDropdownClickHandler(path: string): () => void {
    let handler = this.skippedDropdownHandlers.get(path)
    if (handler === undefined) {
      handler = () => this.onSkippedResolutionDropdownClick(path)
      this.skippedDropdownHandlers.set(path, handler)
    }
    return handler
  }

  private getConflictedFileStatus(path: string) {
    const file = this.props.workingDirectory.files.find(f => f.path === path)
    if (file === undefined || !isConflictedFile(file.status)) {
      return undefined
    }
    return file.status
  }

  private isFileResolvedExternally(file: WorkingDirectoryFileChange): boolean {
    if (!isConflictedFile(file.status)) {
      return false
    }
    // A file with no remaining conflict markers has been resolved in an editor.
    // This wins even when a Current/Incoming choice was previously picked from
    // the dropdown — the on-disk edit is the source of truth, so we show the
    // resolved state rather than the stale dropdown selection.
    if (isConflictWithMarkers(file.status)) {
      return file.status.conflictMarkerCount === 0
    }
    return false
  }

  private renderResolvedFileRow(path: string): JSX.Element {
    return (
      <li key={path} className="copilot-conflicts-file-item">
        <div className="copilot-file-details">
          <PathText path={path} />
          <span className="copilot-file-explanation resolved-text">
            No conflicts remaining
          </span>
        </div>
        <div className="green-circle">
          <Octicon symbol={octicons.check} />
        </div>
      </li>
    )
  }

  private renderResolvedExternally(
    file: WorkingDirectoryFileChange
  ): JSX.Element {
    return this.renderResolvedFileRow(file.path)
  }

  private renderConflictedFile(file: WorkingDirectoryFileChange): JSX.Element {
    const resolution = this.getResolutionForPath(file.path)
    const choice = this.getResolutionForFile(file.path)
    const reasoning = resolution?.reasoning
    const fileStatus = isConflictedFile(file.status) ? file.status : undefined
    const isDeleteConflict =
      fileStatus !== undefined && isDeleteConflictFile(fileStatus)

    // Use "Keep file" / "Delete file" labels for delete-vs-modify conflicts
    let choiceLabel: string
    let choiceIcon: typeof octicons.copilot
    if (isDeleteConflict && isManualConflict(fileStatus)) {
      choiceLabel = getDeleteConflictChoiceLabel(choice, fileStatus)
      choiceIcon =
        choice === 'copilot' ? octicons.copilot : resolutionChoices[choice].icon
    } else {
      const resolved = resolutionChoices[choice]
      choiceLabel = resolved.label
      choiceIcon = resolved.icon
    }

    let reasoningText: string | undefined
    if (choice === 'copilot' && reasoning) {
      reasoningText = reasoning
    } else if (isDeleteConflict) {
      const deletedSide = isManualConflict(fileStatus!)
        ? getDeletedSide(fileStatus!)
        : undefined
      const { ourBranch, theirBranch } = this.props.conflictState
      if (deletedSide === 'ours') {
        const branch = ourBranch ?? 'current branch'
        reasoningText =
          choice === 'ours'
            ? `Deleting file (deleted on ${branch})`
            : `Keeping modified file`
      } else if (deletedSide === 'theirs') {
        const branch = theirBranch ?? 'incoming branch'
        reasoningText =
          choice === 'theirs'
            ? `Deleting file (deleted on ${branch})`
            : `Keeping modified file`
      }
    } else if (choice === 'ours') {
      reasoningText = `Using changes from ${
        this.props.conflictState.ourBranch ?? 'current branch'
      }`
    } else if (choice === 'theirs') {
      reasoningText = `Using changes from ${
        this.props.conflictState.theirBranch ?? 'incoming branch'
      }`
    }

    const onDropdownClick = this.getResolutionDropdownClickHandler(file.path)
    const onOverflowClick = this.getOverflowMenuClickHandler(file.path)

    return (
      <li key={file.path} className="copilot-conflicts-file-item">
        <div className="copilot-file-details">
          <PathText path={file.path} />
          {reasoningText !== undefined && (
            <span className="copilot-file-explanation">{reasoningText}</span>
          )}
        </div>
        <div className="copilot-file-actions">
          <Button
            className="copilot-resolution-dropdown"
            onClick={onDropdownClick}
            disabled={this.state.isContinuing}
          >
            <Octicon symbol={choiceIcon} />
            {choiceLabel}
            <Octicon symbol={octicons.triangleDown} />
          </Button>
          <Button
            className="copilot-overflow-menu"
            onClick={onOverflowClick}
            disabled={this.state.isContinuing}
            ariaLabel="File options"
          >
            <Octicon symbol={octicons.kebabHorizontal} />
          </Button>
        </div>
      </li>
    )
  }

  private renderResolutionSummary(): JSX.Element | null {
    const { copilotResolutionSummary, operationKind, repository, emoji } =
      this.props
    if (copilotResolutionSummary === null) {
      return null
    }
    return (
      <CopilotConflictsResolutionSummary
        summary={copilotResolutionSummary}
        operationKind={operationKind}
        emoji={emoji}
        gitHubRepository={repository.gitHubRepository}
        onMarkdownLinkClicked={this.onMarkdownLinkClicked}
      />
    )
  }

  private onMarkdownLinkClicked = (url: string): void => {
    this.props.dispatcher.openInBrowser(url)
  }

  private renderFileList(
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ): JSX.Element {
    const skippedPaths = this.skippedPaths
    const conflictedFiles = files.filter(
      f => isConflictedFile(f.status) && !skippedPaths.has(f.path)
    )

    return (
      <>
        <h2 className="copilot-conflicts-file-heading">
          <Octicon symbol={octicons.fileCode} />
          {conflictedFiles.length} Conflicted files
        </h2>
        <ul className="copilot-conflicts-file-list">
          {conflictedFiles.map(file =>
            this.isFileResolvedExternally(file)
              ? this.renderResolvedExternally(file)
              : this.renderConflictedFile(file)
          )}
        </ul>
      </>
    )
  }

  private renderSkippedFile(skipped: ICopilotSkippedFile): JSX.Element {
    const file = this.props.workingDirectory.files.find(
      f => f.path === skipped.path
    )

    // If the user resolved the file themselves - by removing every marker in an
    // editor, staging it, or otherwise making it no longer conflicted - show the
    // same "resolved" treatment the main conflicted list uses instead of the
    // resolution dropdown.
    if (
      file === undefined ||
      !isConflictedFile(file.status) ||
      this.isFileResolvedExternally(file)
    ) {
      return this.renderResolvedFileRow(skipped.path)
    }

    const { ourBranch, theirBranch } = this.props.conflictState
    const fileStatus = this.getConflictedFileStatus(skipped.path)
    const { oursLabel, theirsLabel } = getOursTheirsLabels(
      fileStatus,
      ourBranch,
      theirBranch
    )
    const choice = this.getSkippedFileChoice(skipped.path)
    const choiceLabel =
      choice === 'ours'
        ? oursLabel
        : choice === 'theirs'
        ? theirsLabel
        : 'Choose a resolution'

    const onDropdownClick = this.getSkippedDropdownClickHandler(skipped.path)
    const onOverflowClick = this.getOverflowMenuClickHandler(skipped.path)

    return (
      <li key={skipped.path} className="copilot-conflicts-file-item">
        <div className="copilot-file-details">
          <PathText path={skipped.path} />
          <span className="copilot-file-explanation">{skipped.reason}</span>
        </div>
        <div className="copilot-file-actions">
          <Button
            className="copilot-resolution-dropdown"
            onClick={onDropdownClick}
            disabled={this.state.isContinuing}
            ariaLabel="Choose a resolution for this file"
          >
            <Octicon
              symbol={choice === undefined ? octicons.alert : octicons.check}
            />
            {choiceLabel}
            <Octicon symbol={octicons.triangleDown} />
          </Button>
          <Button
            className="copilot-overflow-menu"
            onClick={onOverflowClick}
            disabled={this.state.isContinuing}
            ariaLabel="File options"
          >
            <Octicon symbol={octicons.kebabHorizontal} />
          </Button>
        </div>
      </li>
    )
  }

  private renderSkippedFileList(): JSX.Element | null {
    const skippedFiles = this.skippedFiles
    if (skippedFiles.length === 0) {
      return null
    }

    return (
      <>
        <h2 className="copilot-conflicts-file-heading copilot-conflicts-skipped-heading">
          <Octicon symbol={octicons.alert} />
          {skippedFiles.length} Skipped by Copilot
        </h2>
        <ul className="copilot-conflicts-file-list">
          {skippedFiles.map(file => this.renderSkippedFile(file))}
        </ul>
      </>
    )
  }

  private onTabSelected = (index: CopilotConflictsTab) => {
    this.setState({ selectedTab: index })
  }

  private renderSummaryContent(
    unmergedFiles: ReadonlyArray<WorkingDirectoryFileChange>
  ): JSX.Element {
    return (
      <div className="copilot-conflicts-summary-content">
        {this.renderResolutionSummary()}
        {this.renderFileList(unmergedFiles)}
        {this.renderSkippedFileList()}
      </div>
    )
  }

  private renderTabContent(
    unmergedFiles: ReadonlyArray<WorkingDirectoryFileChange>
  ): JSX.Element {
    switch (this.state.selectedTab) {
      case CopilotConflictsTab.Changes: {
        const conflictedFiles = unmergedFiles.filter(f =>
          isConflictedFile(f.status)
        )
        return (
          <CopilotConflictsChanges
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            conflictedFiles={conflictedFiles}
            copilotResolutions={this.props.copilotResolutions}
            manualResolutions={this.props.conflictState.manualResolutions}
            ourBranch={this.props.conflictState.ourBranch}
            theirBranch={this.props.conflictState.theirBranch}
            onResolutionDropdownClick={this.onResolutionDropdownClick}
          />
        )
      }
      case CopilotConflictsTab.Summary:
        return this.renderSummaryContent(unmergedFiles)
      default:
        return assertNever(
          this.state.selectedTab,
          `Unknown tab: ${this.state.selectedTab}`
        )
    }
  }

  public render() {
    const { operationKind, workingDirectory, model } = this.props
    const { isContinuing, selectedTab } = this.state

    const unmergedFiles = getUnmergedFiles(workingDirectory)
    const operation = __DARWIN__ ? operationKind : operationKind.toLowerCase()

    const hasUnresolvedSkippedFiles = this.hasUnresolvedSkippedFiles()

    const modelLabel =
      model.reasoningEffort !== undefined
        ? `${model.modelName} · ${formatReasoningEffort(model.reasoningEffort)}`
        : model.modelName

    return (
      <Dialog
        id="copilot-conflicts-dialog"
        titleId={CopilotConflictsDialogTitleId}
        dismissDisabled={isContinuing}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onContinue}
        loading={isContinuing}
        disabled={isContinuing}
      >
        <DialogHeader
          title={`Resolve conflicts before ${operationKind}`}
          titleId={CopilotConflictsDialogTitleId}
          showCloseButton={!isContinuing}
          onCloseButtonClick={this.props.onDismissed}
          loading={isContinuing}
        >
          <div className="copilot-conflicts-dialog-model-row">
            <span className="copilot-conflicts-dialog-model">{modelLabel}</span>
            <Button
              className="copilot-conflicts-dialog-settings-button"
              tooltip="Configure Copilot in app settings"
              ariaLabel="Configure Copilot in app settings"
              onClick={this.onOpenCopilotSettings}
            >
              <Octicon symbol={octicons.sliders} />
            </Button>
          </div>
        </DialogHeader>
        <DialogContent>
          <TabBar
            selectedIndex={selectedTab}
            onTabClicked={this.onTabSelected}
            type={TabBarType.Tabs}
          >
            <span>Summary</span>
            <span>Changes</span>
          </TabBar>
          {this.renderTabContent(unmergedFiles)}
        </DialogContent>
        <DialogFooter>
          <div className="copilot-conflicts-footer">
            <Button onClick={this.onBackToManual} disabled={isContinuing}>
              Switch to manual
            </Button>
            <OkCancelButtonGroup
              okButtonText={`Continue ${operation}`}
              okButtonDisabled={hasUnresolvedSkippedFiles || isContinuing}
              okButtonTitle={
                hasUnresolvedSkippedFiles
                  ? 'Some files were skipped by Copilot. Those need to be resolved manually.'
                  : undefined
              }
              cancelButtonText={`Abort ${operation}`}
              onCancelButtonClick={this.onAbort}
              cancelButtonDisabled={isContinuing}
            />
          </div>
        </DialogFooter>
      </Dialog>
    )
  }
}
