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
