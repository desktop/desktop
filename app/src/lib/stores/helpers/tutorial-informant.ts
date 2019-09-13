import { IRepositoryState } from '../../app-state'
import { TutorialStep } from '../../../models/tutorial-step'
import { TipState } from '../../../models/tip'
import { ExternalEditor } from '../../editors'
import { setBoolean, getBoolean } from '../../local-storage'

const skipInstallEditorKey = 'tutorial-install-editor-skipped'
const skipCreatePullRequestKey = 'tutorial-skip-create-pull-request'
export class OnboardingTutorialInformant {
  private installEditorSkipped: boolean = getBoolean(
    skipInstallEditorKey,
    false
  )
  private createPRSkipped: boolean = getBoolean(skipCreatePullRequestKey, false)

  public constructor(
    private resolveCurrentEditor: () => Promise<void>,
    private getResolvedExternalEditor: () => ExternalEditor | null
  ) {}

  public skipInstallEditor = () => {
    this.installEditorSkipped = true
    setBoolean(skipInstallEditorKey, this.installEditorSkipped)
  }
  public skipCreatePR = () => {
    this.createPRSkipped = true
    setBoolean(skipCreatePullRequestKey, this.createPRSkipped)
  }

  public async getCurrentStep(
    isTutorialRepo: boolean,
    repositoryState: IRepositoryState
  ): Promise<TutorialStep> {
    if (!isTutorialRepo) {
      return TutorialStep.NotApplicable
    } else if (!(await this.isEditorInstalled())) {
      return TutorialStep.PickEditor
    } else if (!this.isBranchCheckedOut(repositoryState)) {
      return TutorialStep.CreateBranch
    } else if (!(await this.hasChangedFile(repositoryState))) {
      return TutorialStep.EditFile
    } else if (!(await this.hasMultipleCommits(repositoryState))) {
      return TutorialStep.MakeCommit
    } else if (!(await this.commitPushed(repositoryState))) {
      return TutorialStep.PushBranch
    } else if (!(await this.pullRequestCreated(repositoryState))) {
      return TutorialStep.OpenPullRequest
    } else {
      return TutorialStep.AllDone
    }
  }

  private async isEditorInstalled(): Promise<boolean> {
    if (this.installEditorSkipped || this.getResolvedExternalEditor()) {
      return true
    } else {
      await this.resolveCurrentEditor()
      return !!this.getResolvedExternalEditor()
    }
  }

  private isBranchCheckedOut(repositoryState: IRepositoryState): boolean {
    const { branchesState } = repositoryState
    const { tip } = branchesState

    const currentBranchName =
      tip.kind === TipState.Valid ? tip.branch.name : null
    const defaultBranchName =
      branchesState.defaultBranch !== null
        ? branchesState.defaultBranch.name
        : null

    return (
      currentBranchName !== null &&
      defaultBranchName !== null &&
      currentBranchName !== defaultBranchName
    )
  }

  private async hasChangedFile(
    repositoryState: IRepositoryState
  ): Promise<boolean> {
    if (await this.hasMultipleCommits(repositoryState)) {
      // User has already committed a change
      return true
    }
    const { changesState } = repositoryState
    return changesState.workingDirectory.files.length > 0
  }

  private async hasMultipleCommits(
    repositoryState: IRepositoryState
  ): Promise<boolean> {
    const { branchesState } = repositoryState
    const { tip } = branchesState

    // TODO: Verify with @niik that there will only be one commit initially
    if (tip.kind === TipState.Valid) {
      // For some reason sometimes the initial commit has a parent sha
      // listed as an empty string...
      // For now I'm filtering those out. Would be better to prevent that from happening
      return tip.branch.tip.parentSHAs.filter(Boolean).length > 0
    }

    return false
  }

  private async commitPushed(
    repositoryState: IRepositoryState
  ): Promise<boolean> {
    const { aheadBehind } = repositoryState
    return aheadBehind !== null && aheadBehind.ahead === 0
  }

  private async pullRequestCreated(
    repositoryState: IRepositoryState
  ): Promise<boolean> {
    if (this.createPRSkipped) {
      return true
    }

    const {
      branchesState: { currentPullRequest },
    } = repositoryState
    return currentPullRequest !== null
  }
}
