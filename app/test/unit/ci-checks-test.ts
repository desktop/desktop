import { describe, it } from 'node:test'
import assert from 'node:assert'
import { APICheckConclusion, APICheckStatus } from '../../src/lib/api'
import {
  getCheckRunsGroupedByActionWorkflowNameAndEvent,
  IRefCheck,
} from '../../src/lib/ci-checks/ci-checks'

describe('getCheckRunsGroupedByActionWorkflowNameAndEvent', () => {
  it('groups by actions workflow name', () => {
    const checkRuns = [
      buildMockCheckRun('1', '', 'test1'),
      buildMockCheckRun('1', '', 'test2'),
    ]
    const groups = getCheckRunsGroupedByActionWorkflowNameAndEvent(checkRuns)
    const groupNames = [...groups.keys()]
    assert(groupNames.includes('test1'))
    assert(groupNames.includes('test2'))
  })

  it('groups any check run without an actions workflow name into Other', () => {
    const checkRuns = [
      buildMockCheckRun('1', '', 'test1'),
      buildMockCheckRun('1', ''),
    ]
    const groups = getCheckRunsGroupedByActionWorkflowNameAndEvent(checkRuns)
    const groupNames = [...groups.keys()]
    assert(groupNames.includes('test1'))
    assert(groupNames.includes('Other'))
  })

  it('groups any check run without an actions workflow name with an app name of "GitHub Code Scanning" into "Code scanning results"', () => {
    const checkRuns = [
      buildMockCheckRun('1', '', 'test1'),
      buildMockCheckRun('1', ''),
      buildMockCheckRun('1', 'GitHub Code Scanning'),
    ]
    const groups = getCheckRunsGroupedByActionWorkflowNameAndEvent(checkRuns)
    const groupNames = [...groups.keys()]
    assert(groupNames.includes('test1'))
    assert(groupNames.includes('Other'))
    assert(groupNames.includes('Code scanning results'))
  })

  it('groups by actions event type if more than one event type', () => {
    const checkRuns = [
      buildMockCheckRun('1', '', 'test1'),
      buildMockCheckRun('1', '', 'test2'),
    ]
    let groups = getCheckRunsGroupedByActionWorkflowNameAndEvent(checkRuns)
    let groupNames = [...groups.keys()]

    // no event types
    assert(groupNames.includes('test1'))
    assert(groupNames.includes('test2'))

    checkRuns.push(buildMockCheckRun('1', '', 'test3', 'pull_request'))
    groups = getCheckRunsGroupedByActionWorkflowNameAndEvent(checkRuns)
    groupNames = [...groups.keys()]

    // only one event
    assert(groupNames.includes('test1'))
    assert(groupNames.includes('test2'))
    assert(groupNames.includes('test3'))

    checkRuns.push(buildMockCheckRun('1', '', 'test4', 'push'))
    groups = getCheckRunsGroupedByActionWorkflowNameAndEvent(checkRuns)
    groupNames = [...groups.keys()]

    // two event types for test3 and test4
    assert(groupNames.includes('test1'))
    assert(groupNames.includes('test2'))
    assert(groupNames.includes('test3 (pull_request)'))
    assert(groupNames.includes('test4 (push)'))
  })
})

function buildMockCheckRun(
  name: string,
  appName: string = '',
  actionWorkflowName?: string,
  actionWorkflowEvent?: string
): IRefCheck {
  return {
    id: 1,
    name,
    description: '',
    status: APICheckStatus.Completed,
    conclusion: APICheckConclusion.Success,
    appName,
    htmlUrl: null,
    checkSuiteId: null,
    actionsWorkflow:
      actionWorkflowName || actionWorkflowEvent
        ? {
            name: actionWorkflowName || '',
            event: actionWorkflowEvent || '',
            id: 1,
            workflow_id: 1,
            cancel_url: '',
            created_at: '',
            logs_url: '',
            rerun_url: '',
            check_suite_id: 1,
          }
        : undefined,
  }
}
