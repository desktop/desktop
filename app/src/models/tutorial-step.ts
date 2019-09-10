export enum TutorialStep {
  NotApplicable = 'NotApplicable',
  PickEditor = 'PickEditor',
  CreateBranch = 'CreateBranch',
  EditFile = 'EditFile',
  MakeCommit = 'MakeCommit',
  PushBranch = 'PushBranch',
  OpenPullRequest = 'OpenPullRequest',
  AllDone = 'AllDone',
}

export type ValidTutorialStep =
  | TutorialStep.PickEditor
  | TutorialStep.CreateBranch
  | TutorialStep.EditFile
  | TutorialStep.MakeCommit
  | TutorialStep.PushBranch
  | TutorialStep.OpenPullRequest
  | TutorialStep.AllDone

export function isValidTutorialStep(
  step: TutorialStep
): step is ValidTutorialStep {
  const order = TutorialStepOrder.get(step)
  return order !== undefined && order > 0
}

export const TutorialStepOrder: ReadonlyMap<TutorialStep, number> = new Map([
  [TutorialStep.NotApplicable, 0],
  [TutorialStep.PickEditor, 1],
  [TutorialStep.CreateBranch, 2],
  [TutorialStep.EditFile, 3],
  [TutorialStep.MakeCommit, 4],
  [TutorialStep.PushBranch, 5],
  [TutorialStep.OpenPullRequest, 6],
  [TutorialStep.AllDone, 7],
])
