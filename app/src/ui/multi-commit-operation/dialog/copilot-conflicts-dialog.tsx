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
} from '../../../models/status'
import { getUnmergedFiles, isConflictedFile } from '../../../lib/status'
import { assertNever } from '../../../lib/fatal-error'
import { ManualConflictResolution } from '../../../models/manual-conflict-resolution'
import {
  IFileResolution,
  ICopilotResolutionSummary,
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
} from './copilot-resolution-helpers'

interface ICopilotConflictsDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly conflictState: MultiCommitOperationConflictState
  readonly workingDirectory: WorkingDirectoryStatus
  readonly operationKind: MultiCommitOperationKind
  readonly copilotResolutions: ReadonlyArray<IFileResolution> | null
  readonly copilotResolutionSummary: ICopilotResolutionSummary | null
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

    const oursLabel = ourBranch
      ? `Use current file from ${ourBranch}`
      : 'Use current file'
    const theirsLabel = theirBranch
      ? `Use incoming file from ${theirBranch}`
      : 'Use incoming file'

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

  private isFileResolvedExternally(file: WorkingDirectoryFileChange): boolean {
    if (!isConflictedFile(file.status)) {
      return false
    }
    const manualResolution = this.props.conflictState.manualResolutions.get(
      file.path
    )
    if (manualResolution !== undefined) {
      return false
    }
    if (isConflictWithMarkers(file.status)) {
      return file.status.conflictMarkerCount === 0
    }
    return false
  }

  private renderResolvedExternally(
    file: WorkingDirectoryFileChange
  ): JSX.Element {
    return (
      <li key={file.path} className="copilot-conflicts-file-item">
        <div className="copilot-file-details">
          <PathText path={file.path} />
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

  private renderConflictedFile(file: WorkingDirectoryFileChange): JSX.Element {
    const resolution = this.getResolutionForPath(file.path)
    const choice = this.getResolutionForFile(file.path)
    const { label: choiceLabel, icon: choiceIcon } = resolutionChoices[choice]
    const reasoning = resolution?.reasoning

    const reasoningText =
      choice === 'copilot' && reasoning
        ? reasoning
        : choice === 'ours'
        ? `Using changes from ${
            this.props.conflictState.ourBranch ?? 'current branch'
          }`
        : choice === 'theirs'
        ? `Using changes from ${
            this.props.conflictState.theirBranch ?? 'incoming branch'
          }`
        : undefined

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
    const conflictedFiles = files.filter(f => isConflictedFile(f.status))

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
