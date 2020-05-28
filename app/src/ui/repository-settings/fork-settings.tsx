import * as React from 'react'
import { DialogContent } from '../dialog'
import { ForkContributionTarget } from '../../models/workflow-preferences'
import { RepositoryWithForkedGitHubRepository } from '../../models/repository'

interface IGitIgnoreProps {
  readonly forkContributionTarget: ForkContributionTarget
  readonly repository: RepositoryWithForkedGitHubRepository
  readonly onForkContributionTargetChanged: (
    forkContributionTarget: ForkContributionTarget
  ) => void
}

enum RadioButtonId {
  Parent = 'ForkContributionTargetParent',
  Self = 'ForkContributionTargetSelf',
}

/** A view for creating or modifying the repository's gitignore file */
export class ForkSettings extends React.Component<IGitIgnoreProps, {}> {
  public render() {
    return (
      <DialogContent>
        <h2>I'll be using this fork…</h2>

        <div className="radio-component">
          <input
            type="radio"
            id={RadioButtonId.Parent}
            value={ForkContributionTarget.Parent}
            checked={
              this.props.forkContributionTarget ===
              ForkContributionTarget.Parent
            }
            onChange={this.onForkContributionTargetChanged}
          />
          <label htmlFor={RadioButtonId.Parent}>
            To contribute to the parent repository
          </label>
        </div>
        <div className="radio-component">
          <input
            type="radio"
            id={RadioButtonId.Self}
            value={ForkContributionTarget.Self}
            checked={
              this.props.forkContributionTarget === ForkContributionTarget.Self
            }
            onChange={this.onForkContributionTargetChanged}
          />
          <label htmlFor={RadioButtonId.Self}>For my own purposes</label>
        </div>

        {this.renderDescription()}
      </DialogContent>
    )
  }

  private renderDescription() {
    // We can't use the getNonForkGitHubRepository() helper since we need to calculate
    // the value based on the temporary form state.
    const targetRepository =
      this.props.forkContributionTarget === ForkContributionTarget.Self
        ? this.props.repository.gitHubRepository
        : this.props.repository.gitHubRepository.parent

    return (
      <ul className="fork-settings-description">
        <li>
          Pull requests targeting <strong>{targetRepository.fullName}</strong>{' '}
          will be shown in the pull request list.
        </li>
        <li>
          Issues will be created in <strong>{targetRepository.fullName}</strong>
          .
        </li>
        <li>
          "View on Github" will open{' '}
          <strong>{targetRepository.fullName}</strong> in the browser.
        </li>
        <li>
          New branches will be based on{' '}
          <strong>{targetRepository.fullName}</strong>'s default branch.
        </li>
      </ul>
    )
  }

  private onForkContributionTargetChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.value as ForkContributionTarget

    this.props.onForkContributionTargetChanged(value)
  }
}
