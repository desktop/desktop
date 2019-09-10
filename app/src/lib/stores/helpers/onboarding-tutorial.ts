export class OnboardingTutorial {
  public constructor() {
    this.skipInstallEditor = false
    this.skipCreatePR = false
  }

  public getCurrentStep() {
    // call all other methods to check where we're at
  }

    if (this.skipInstallEditor) {
  private async isEditorInstalled(): Promise<boolean> {
      return true
    }
    return false
  }

  private isBranchCreated(): boolean {
    return false
  }

  private isReadmeEdited(): boolean {
    return false
  }

  private hasCommit(): boolean {
    return false
  }

  private commitPushed(): boolean {
    return false
  }

  private pullRequestCreated(): boolean {
    if (this.skipCreatePR) {
      return true
    }
    return false
  }

  public skipEditorInstall() {
    this.skipEditorInstall = true
  }

  public skipCreatePR() {
    this.skipCreatePR = true
  }
}
