import * as React from 'react'
import { DialogContent } from '../dialog'
import { ForkContributionTarget } from '../../models/workflow-preferences'
import { RepositoryWithForkedGitHubRepository } from '../../models/repository'
import { ForkSettingsDescription } from './fork-contribution-target-description'
import { RadioButton } from '../lib/radio-button'

interface IForkSettingsProps {
  readonly forkContributionTarget: ForkContributionTarget
  readonly repository: RepositoryWithForkedGitHubRepository
  readonly onForkContributionTargetChanged: (
    forkContributionTarget: ForkContributionTarget
  ) => void
}

/** A view for creating or modifying the repository's gitignore file */
export class ForkSettings extends React.Component<IForkSettingsProps, {}> {
  public render() {
    return (
      <DialogContent>
        <h2>I'll be using this fork…</h2>

        <RadioButton
          value={ForkContributionTarget.Parent}
          checked={
            this.props.forkContributionTarget === ForkContributionTarget.Parent
          }
          label="To contribute to the parent repository"
          onSelected={this.onForkContributionTargetChanged}
        />

        <RadioButton
          value={ForkContributionTarget.Self}
          checked={
            this.props.forkContributionTarget === ForkContributionTarget.Self
          }
          label="For my own purposes"
          onSelected={this.onForkContributionTargetChanged}
        />

        <ForkSettingsDescription
          repository={this.props.repository}
          forkContributionTarget={this.props.forkContributionTarget}
        />
      </DialogContent>
    )
  }

  private onForkContributionTargetChanged = (value: ForkContributionTarget) => {
    this.props.onForkContributionTargetChanged(value)
  }
}
