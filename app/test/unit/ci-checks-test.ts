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
    expect(groupNames.includes('test1')).toBe(true)
    expect(groupNames.includes('test2')).toBe(true)
  })

  it('groups any check run without an actions workflow name into Other', () => {
    const checkRuns = [
      buildMockCheckRun('1', '', 'test1'),
      buildMockCheckRun('1', ''),
    ]
    const groups = getCheckRunsGroupedByActionWorkflowNameAndEvent(checkRuns)
    const groupNames = [...groups.keys()]
    expect(groupNames.includes('test1')).toBe(true)
    expect(groupNames.includes('Other')).toBe(true)
  })

  it('groups any check run without an actions workflow name with an app name of "GitHub Code Scanning" into "Code scanning results"', () => {
    const checkRuns = [
      buildMockCheckRun('1', '', 'test1'),
      buildMockCheckRun('1', ''),
      buildMockCheckRun('1', 'GitHub Code Scanning'),
    ]
    const groups = getCheckRunsGroupedByActionWorkflowNameAndEvent(checkRuns)
    const groupNames = [...groups.keys()]
    expect(groupNames.includes('test1')).toBe(true)
    expect(groupNames.includes('Other')).toBe(true)
    expect(groupNames.includes('Code scanning results')).toBe(true)
  })

  it('groups by actions event type if more than one event type', () => {
    const checkRuns = [
      buildMockCheckRun('1', '', 'test1'),
      buildMockCheckRun('1', '', 'test2'),
    ]
    let groups = getCheckRunsGroupedByActionWorkflowNameAndEvent(checkRuns)
    let groupNames = [...groups.keys()]

    // no event types
    expect(groupNames.includes('test1')).toBe(true)
    expect(groupNames.includes('test2')).toBe(true)

    checkRuns.push(buildMockCheckRun('1', '', 'test3', 'pull_request'))
    groups = getCheckRunsGroupedByActionWorkflowNameAndEvent(checkRuns)
    groupNames = [...groups.keys()]

    // only one event
    expect(groupNames.includes('test1')).toBe(true)
    expect(groupNames.includes('test2')).toBe(true)
    expect(groupNames.includes('test3')).toBe(true)

    checkRuns.push(buildMockCheckRun('1', '', 'test4', 'push'))
    groups = getCheckRunsGroupedByActionWorkflowNameAndEvent(checkRuns)
    groupNames = [...groups.keys()]

    // two event types for test3 and test4
    expect(groupNames.includes('test1')).toBe(true)
    expect(groupNames.includes('test2')).toBe(true)
    expect(groupNames.includes('test3 (pull_request)')).toBe(true)
    expect(groupNames.includes('test4 (push)')).toBe(true)
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
