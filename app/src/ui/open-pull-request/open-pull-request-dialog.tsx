import * as React from 'react'
import {
  IBranchesState,
  IPullRequestState,
  IConstrainedValue,
} from '../../lib/app-state'
import { Commit } from '../../models/commit'
import { ImageDiffType } from '../../models/diff'
import { Repository } from '../../models/repository'
import { Dialog, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Dispatcher } from '../dispatcher'
import { Select } from '../lib/select'

interface IOpenPullRequestDialogProps {
  readonly branchesState: IBranchesState
  readonly pullRequestState: IPullRequestState

  readonly commitSummaryWidth: IConstrainedValue
  readonly sidebarWidth: IConstrainedValue

  readonly dispatcher: Dispatcher
  readonly repository: Repository

  readonly selectedDiffType: ImageDiffType
  readonly showSideBySideDiff: boolean
  readonly hideWhitespaceInDiff: boolean
  readonly externalEditorLabel?: string

  readonly onOpenInExternalEditor: (fullPath: string) => void
  readonly onViewCommitOnGitHub: (SHA: string, filePath?: string) => void

  readonly commitLookup: Map<string, Commit>
  readonly emoji: Map<string, string>
  readonly imageDiffType: ImageDiffType

  /** Called to dismiss the dialog */
  readonly onDismissed: () => void
}

/** The component for viewing the diff of a pull request. */
export class OpenPullRequestDialog extends React.Component<IOpenPullRequestDialogProps> {
  private renderControls() {
    return <>Controls Here</>
  }

  private renderDiff() {
    return <>Diff Here</>
  }

  private renderFooter() {
    return (
      <DialogFooter>
        <OkCancelButtonGroup cancelButtonVisible={false} />
      </DialogFooter>
    )
  }

  public render() {
    return (
      <Dialog
        className="create-pull-request"
        title={__DARWIN__ ? 'Open a Pull Request' : 'Open a pull request'}
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        {this.renderControls()}
        {this.renderDiff()}
        {this.renderFooter()}
      </Dialog>
    )
  }
}
