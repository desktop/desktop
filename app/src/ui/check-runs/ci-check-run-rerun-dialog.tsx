import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { IRefCheck } from '../../lib/ci-checks/ci-checks'
import { CICheckRunList } from './ci-check-run-list'
import { GitHubRepository } from '../../models/github-repository'
import { Dispatcher } from '../dispatcher'

interface ICICheckRunRerunDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: GitHubRepository
  /** List of all the check runs (some of which are not rerunnable) */
  readonly checkRuns: ReadonlyArray<IRefCheck>
  readonly onDismissed: () => void
}

/**
 * Dialog that informs the user of which jobs will be rerun
 */
export class CICheckRunRerunDialog extends React.Component<
  ICICheckRunRerunDialogProps
> {
  public constructor(props: ICICheckRunRerunDialogProps) {
    super(props)
  }

  private onSubmit = async () => {
    // TODO: filter to only rerunable jobs
    this.props.dispatcher.rerequestCheckSuites(
      this.props.repository,
      this.props.checkRuns
    )
  }

  private renderRerunnableJobsList = () => {
    // TODO: Only display rerunable jobs
    // Display a note about how many jobs were not rerunable, or toggle the list?
    return (
      <div className="ci-check-run-list check-run-rerun-list">
        <CICheckRunList
          checkRuns={this.props.checkRuns}
          loadingActionLogs={false}
          loadingActionWorkflows={false}
        />
      </div>
    )
  }

  public render() {
    return (
      <Dialog
        id="rerun-check-runs"
        title={__DARWIN__ ? 'Re-run Jobs' : 'Re-run jobs'}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>{this.renderRerunnableJobsList()}</DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Re-run Jobs' : 'Re-run jobs'}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
