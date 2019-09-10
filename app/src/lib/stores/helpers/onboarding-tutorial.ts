export class OnboardingTutorial {
  public constructor({ resolveEditor, getEditor }) {
    this.skipInstallEditor = false
    this.skipCreatePR = false
    this.resolveEditor = resolveEditor
    this.getEditor = getEditor
  }

  public getCurrentStep(repository) {
    if (!repository.isTutorialRepository) {
      return null
    }
    // call all other methods to check where we're at
  }

  private async isEditorInstalled(): Promise<boolean> {
    if (this.skipInstallEditor || this.getEditor()) {
      return true
    } else {
      await this.resolveEditor()
      return !!this.getEditor()
    }
  }

  private isBranchCreated(): boolean {
    return false
  }

  private hasChangedFile(repository): boolean {
    return this.getChangedFiles(repository).length > 0
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
