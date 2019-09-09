export class OnboardingTutorial {
  public constructor() {
    this.skipInstallEditor = false
    this.skipCreatePR = false
  }

  getCurrentStep() {
    // call all other methods to check where we're at
  }

  isEditorInstalled() {
    if (this.skipInstallEditor) {
      return true
    }
    return false
  }

  isBranchCreated() {
    return false
  }

  isReadmeEdited() {
    return false
  }

  hasCommit() {
    return false
  }

  commitPushed() {
    return false
  }

  pullRequestCreated() {
    if (this.skipCreatePR) {
      return true
    }
    return false
  }

  skipEditorInstall() {
    this.skipEditorInstall = true
  }

  skipCreatePR() {
    this.skipCreatePR = true
  }
}
