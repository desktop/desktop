export class OnboardingTutorial {
  public constructor() {
    this.skipInstallEditor = false
    this.skipCreatePR = false
  }

  getCurrentStep() {
    // call all other methods to check
  }

  isEditorInstalled() {
    if (this.skipInstallEditor) {
      return true
    }
    return false
  }

  isBranchCreated() {}

  isReadmeEdited() {}

  hasCommit() {}

  commitPushed() {}

  pullRequestCreated() {
    if (this.skipCreatePR) {
      return true
    }
    return false
  }
}
