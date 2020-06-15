import * as React from 'react'

import {
  RepositoryWithForkedGitHubRepository,
  getForkContributionTarget,
} from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Row } from '../lib/row'
import { Dialog, DialogContent, DialogFooter } from '../dialog'

import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { ForkContributionTarget } from '../../models/workflow-preferences'
import { VerticalSegmentedControl } from '../lib/vertical-segmented-control'
import { ForkSettingsDescription } from '../repository-settings/fork-contribution-target-description'

interface IChooseForkSettingsProps {
  readonly dispatcher: Dispatcher
  /**
   * The current repository.
   * It needs to be a forked GitHub-based repository
   */
  readonly repository: RepositoryWithForkedGitHubRepository
  /**
   * Event triggered when the dialog is dismissed by the user.
   * This happens both when the user clicks on "Continue" to
   * save their changes or when they click on "Cancel".
   */
  readonly onDismissed: () => void
}

interface IChooseForkSettingsState {
  /** The currently selected ForkContributionTarget value */
  readonly forkContributionTarget: ForkContributionTarget
}

export class ChooseForkSettings extends React.Component<
  IChooseForkSettingsProps,
  IChooseForkSettingsState
> {
  public constructor(props: IChooseForkSettingsProps) {
    super(props)

    this.state = {
      forkContributionTarget: getForkContributionTarget(props.repository),
    }
  }

  public render() {
    const selectedItem =
      this.state.forkContributionTarget === ForkContributionTarget.Parent
        ? 0
        : 1

    const items = [
      {
        title: 'To contribute to the parent project',
        description: (
          <>
            We will help you contribute to the{' '}
            <strong>
              {this.props.repository.gitHubRepository.parent.fullName}
            </strong>{' '}
            repository
          </>
        ),
      },
      {
        title: 'For my own purposes',
        description: (
          <>
            We will help you contribute to the{' '}
            <strong>{this.props.repository.gitHubRepository.fullName}</strong>{' '}
            repository
          </>
        ),
      },
    ]

    return (
      <Dialog
        id="fork-settings"
        title="How are you planning to use this fork?"
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <Row>
            <VerticalSegmentedControl
              label="You have changes on this branch. What would you like to do with them?"
              items={items}
              selectedIndex={selectedItem}
              onSelectionChanged={this.onSelectionChanged}
            />
          </Row>
          <Row>
            <ForkSettingsDescription
              repository={this.props.repository}
              forkContributionTarget={this.state.forkContributionTarget}
            />
          </Row>
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup okButtonText="Continue" />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSelectionChanged = (selectionIndex: number) => {
    const forkContributionTarget =
      selectionIndex === 0
        ? ForkContributionTarget.Parent
        : ForkContributionTarget.Self

    this.setState({
      forkContributionTarget,
    })
  }

  private onSubmit = async () => {
    this.props.dispatcher.updateRepositoryWorkflowPreferences(
      this.props.repository,
      {
        forkContributionTarget: this.state.forkContributionTarget,
      }
    )
    this.props.onDismissed()
  }
}
