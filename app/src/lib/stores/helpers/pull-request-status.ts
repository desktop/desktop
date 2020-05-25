import {
  IAPIRefStatus,
  IAPIRefCheckRuns,
  APIRefState,
  IAPIRefCheckRunItem,
} from '../../api'
import { IRefStatus } from '../commit-status-store'

export function createRefStatus(
  statuses: IAPIRefStatus,
  checkRuns: IAPIRefCheckRuns
): IRefStatus {
  // Filtered array of check runs displayed
  // in PR merge box
  const prCheckRunsList = checkRuns.check_runs.filter(
    run => run.pull_requests.length > 0
  )
  const prCheckRuns: IAPIRefCheckRuns = {
    total_count: prCheckRunsList.length,
    check_runs: prCheckRunsList,
  }

  const totalCount = statuses.total_count + prCheckRuns.total_count

  const STATES_PRIORITY = ['pending', 'failure', 'success']

  let state: APIRefState = 'success'

  if (statuses.total_count > 0) {
    state = statuses.state
  }

  if (prCheckRuns.total_count > 0) {
    state = prCheckRuns.check_runs.reduce((runState, checkRun) => {
      const checkRunStatus = checkRunToStatus(checkRun)
      if (
        STATES_PRIORITY.indexOf(checkRunStatus) <
        STATES_PRIORITY.indexOf(runState)
      ) {
        return checkRunStatus
      }
      return runState
    }, state)
  }

  return { statuses, checkRuns: prCheckRuns, totalCount, state }
}

function checkRunToStatus(checkRun: IAPIRefCheckRunItem): APIRefState {
  if (checkRun.status === 'queued' || checkRun.status === 'in_progress') {
    return 'pending'
  }
  if (checkRun.conclusion === 'success') {
    return 'success'
  }
  return 'failure'
}
