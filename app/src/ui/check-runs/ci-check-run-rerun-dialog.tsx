import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { IRefCheck } from '../../lib/ci-checks/ci-checks'
import { CICheckRunList } from './ci-check-run-list'
import { GitHubRepository } from '../../models/github-repository'
import { Dispatcher } from '../dispatcher'
import { IAPICheckSuite } from '../../lib/api'

interface ICICheckRunRerunDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: GitHubRepository
  /** List of all the check runs (some of which are not rerunnable) */
  readonly checkRuns: ReadonlyArray<IRefCheck>
  readonly onDismissed: () => void
}

interface ICICheckRunRerunDialogState {
  readonly loadingCheckSuites: boolean
  readonly rerunnable: ReadonlyArray<IRefCheck>
  readonly nonRerunnable: ReadonlyArray<IRefCheck>
}

/**
 * Dialog that informs the user of which jobs will be rerun
 */
export class CICheckRunRerunDialog extends React.Component<
  ICICheckRunRerunDialogProps,
  ICICheckRunRerunDialogState
> {
  public constructor(props: ICICheckRunRerunDialogProps) {
    super(props)
    this.state = { loadingCheckSuites: true, rerunnable: [], nonRerunnable: [] }
    this.determineRerunnability()
  }

  private onSubmit = async () => {
    this.props.dispatcher.rerequestCheckSuites(
      this.props.repository,
      this.state.rerunnable
    )
  }

  private determineRerunnability = async () => {
    // Get unique set of check suite ids
    const checkSuiteIds = new Set(
      this.props.checkRuns.map(cr => cr.checkSuiteId)
    )

    const checkSuitesPromises = new Array<Promise<IAPICheckSuite | null>>()

    for (const id of checkSuiteIds) {
      if (id === null) {
        continue
      }
      checkSuitesPromises.push(
        this.props.dispatcher.fetchCheckSuite(this.props.repository, id)
      )
    }

    const rerequestableCheckSuiteIds: number[] = []
    for (const cs of await Promise.all(checkSuitesPromises)) {
      if (cs === null) {
        continue
      }

      if (cs.rerequestable) {
        rerequestableCheckSuiteIds.push(cs.id)
      }
    }

    const rerunnable = this.props.checkRuns.filter(
      cr =>
        cr.checkSuiteId !== null &&
        rerequestableCheckSuiteIds.includes(cr.checkSuiteId)
    )
    const nonRerunnable = this.props.checkRuns.filter(
      cr =>
        cr.checkSuiteId === null ||
        !rerequestableCheckSuiteIds.includes(cr.checkSuiteId)
    )

    this.setState({ loadingCheckSuites: false, rerunnable, nonRerunnable })
  }

  private renderRerunnableJobsList = () => {
    if (this.state.loadingCheckSuites) {
      return <>Determining rerunability...</>
    }

    return (
      <>
        <div className="non-re-run-info">
          There are {this.state.nonRerunnable.length} checks that cannot be
          rerun. The following checks that will be rerun.
        </div>

        <div className="ci-check-run-list check-run-rerun-list">
          <CICheckRunList
            checkRuns={this.state.rerunnable}
            loadingActionLogs={false}
            loadingActionWorkflows={false}
            selectable={true}
          />
        </div>
      </>
    )
  }

  public render() {
    return (
      <Dialog
        id="rerun-check-runs"
        title={__DARWIN__ ? 'Re-run checks' : 'Re-run checks'}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>{this.renderRerunnableJobsList()}</DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Re-run checks' : 'Re-run checks'}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
