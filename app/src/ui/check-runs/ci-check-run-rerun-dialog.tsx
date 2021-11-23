import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { IRefCheck } from '../../lib/ci-checks/ci-checks'
import { CICheckRunList } from './ci-check-run-list'
import { GitHubRepository } from '../../models/github-repository'
import { Dispatcher } from '../dispatcher'
import { APICheckStatus, IAPICheckSuite } from '../../lib/api'
import moment from 'moment'

interface ICICheckRunRerunDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: GitHubRepository
  /** List of all the check runs (some of which are not rerunnable) */
  readonly checkRuns: ReadonlyArray<IRefCheck>
  readonly onDismissed: () => void
}

interface ICICheckRunRerunDialogState {
  readonly loadingCheckSuites: boolean
  readonly loadingRerun: boolean
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
    this.state = {
      loadingCheckSuites: true,
      loadingRerun: false,
      rerunnable: [],
      nonRerunnable: [],
    }
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

      const created = moment(cs.created_at)
      const monthsSinceCreated = moment().diff(created, 'months')
      if (
        cs.rerequestable &&
        monthsSinceCreated < 1 && // Must be less than a month old
        cs.status === APICheckStatus.Completed // Must be completed
      ) {
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
      return <>Please wait. Determining which checks can be rerun.</>
    }

    const pluralize = `check${this.state.nonRerunnable.length !== 1 ? 's' : ''}`
    const verb = this.state.nonRerunnable.length !== 1 ? 'are' : 'is'
    return (
      <>
        <div className="non-re-run-info">
          {this.state.rerunnable.length === 0
            ? `There are no checks that can be rerun. `
            : `There ${verb} ${this.state.nonRerunnable.length} ${pluralize} that cannot be rerun. `}
          {this.state.nonRerunnable.length > 0
            ? `A check run cannot be rerun if the check is more than one month old,
          the check has not completed, or the check is not configured to be
          rerun. `
            : null}
          {this.state.rerunnable.length > 0
            ? 'The following checks will be rerun.'
            : null}
        </div>

        <div className="ci-check-run-list check-run-rerun-list">
          {this.state.rerunnable.length > 0 ? (
            <CICheckRunList
              checkRuns={this.state.rerunnable}
              loadingActionLogs={false}
              loadingActionWorkflows={false}
              selectable={true}
            />
          ) : null}
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
        loading={this.state.loadingCheckSuites || this.state.loadingRerun}
      >
        <DialogContent>{this.renderRerunnableJobsList()}</DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Re-run checks' : 'Re-run checks'}
            okButtonDisabled={this.state.rerunnable.length === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
