import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { Row } from '../../ui/lib/row'
import { SamplesURL } from '../../lib/stats'
import { UncommittedChangesStrategyKind } from '../../models/uncommitted-changes-strategy'

interface IAdvancedPreferencesProps {
  readonly optOutOfUsageTracking: boolean
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmForcePush: boolean
  readonly uncommittedChangesStrategyKind: UncommittedChangesStrategyKind
  readonly onOptOutofReportingchanged: (checked: boolean) => void
  readonly onConfirmDiscardChangesChanged: (checked: boolean) => void
  readonly onConfirmRepositoryRemovalChanged: (checked: boolean) => void
  readonly onConfirmForcePushChanged: (checked: boolean) => void
  readonly onUncommittedChangesStrategyKindChanged: (
    value: UncommittedChangesStrategyKind
  ) => void
}

interface IAdvancedPreferencesState {
  readonly optOutOfUsageTracking: boolean
  readonly confirmRepositoryRemoval: boolean
  readonly confirmDiscardChanges: boolean
  readonly confirmForcePush: boolean
  readonly uncommittedChangesStrategyKind: UncommittedChangesStrategyKind
}

export class Advanced extends React.Component<
  IAdvancedPreferencesProps,
  IAdvancedPreferencesState
> {
  public constructor(props: IAdvancedPreferencesProps) {
    super(props)

    this.state = {
      optOutOfUsageTracking: this.props.optOutOfUsageTracking,
      confirmRepositoryRemoval: this.props.confirmRepositoryRemoval,
      confirmDiscardChanges: this.props.confirmDiscardChanges,
      confirmForcePush: this.props.confirmForcePush,
      uncommittedChangesStrategyKind: this.props.uncommittedChangesStrategyKind,
    }
  }

  private onReportingOptOutChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ optOutOfUsageTracking: value })
    this.props.onOptOutofReportingchanged(value)
  }

  private onConfirmDiscardChangesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmDiscardChanges: value })
    this.props.onConfirmDiscardChangesChanged(value)
  }

  private onConfirmForcePushChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmForcePush: value })
    this.props.onConfirmForcePushChanged(value)
  }

  private onConfirmRepositoryRemovalChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ confirmRepositoryRemoval: value })
    this.props.onConfirmRepositoryRemovalChanged(value)
  }

  private onUncommittedChangesStrategyKindChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.value as UncommittedChangesStrategyKind

    this.setState({ uncommittedChangesStrategyKind: value })
    this.props.onUncommittedChangesStrategyKindChanged(value)
  }

  private reportDesktopUsageLabel() {
    return (
      <span>
        Help GitHub Desktop improve by submitting{' '}
        <LinkButton uri={SamplesURL}>usage stats</LinkButton>
      </span>
    )
  }

  public render() {
    return (
      <DialogContent>
        <h2>If I have changes and I switch branches...</h2>
        <Row>
          <input
            type="radio"
            id={UncommittedChangesStrategyKind.AskForConfirmation}
            value={UncommittedChangesStrategyKind.AskForConfirmation}
            checked={
              this.state.uncommittedChangesStrategyKind ===
              UncommittedChangesStrategyKind.AskForConfirmation
            }
            onChange={this.onUncommittedChangesStrategyKindChanged}
          />
          <label htmlFor={UncommittedChangesStrategyKind.AskForConfirmation}>
            Ask me where I want the changes to go
          </label>
        </Row>
        <Row>
          <input
            type="radio"
            id={UncommittedChangesStrategyKind.MoveToNewBranch}
            value={UncommittedChangesStrategyKind.MoveToNewBranch}
            checked={
              this.state.uncommittedChangesStrategyKind ===
              UncommittedChangesStrategyKind.MoveToNewBranch
            }
            onChange={this.onUncommittedChangesStrategyKindChanged}
          />
          <label htmlFor={UncommittedChangesStrategyKind.MoveToNewBranch}>
            Always bring my changes to my new branch
          </label>
        </Row>
        <Row>
          <input
            type="radio"
            id={UncommittedChangesStrategyKind.StashOnCurrentBranch}
            value={UncommittedChangesStrategyKind.StashOnCurrentBranch}
            checked={
              this.state.uncommittedChangesStrategyKind ===
              UncommittedChangesStrategyKind.StashOnCurrentBranch
            }
            onChange={this.onUncommittedChangesStrategyKindChanged}
          />
          <label htmlFor={UncommittedChangesStrategyKind.StashOnCurrentBranch}>
            Always stash and leave my changes on the current branch
          </label>
        </Row>

        <h2>Show a confimration dialog before...</h2>
        <Row>
          <Checkbox
            label="Removing repositories"
            value={
              this.state.confirmRepositoryRemoval
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onConfirmRepositoryRemovalChanged}
          />
        </Row>
        <Row>
          <Checkbox
            label="Discarding changes"
            value={
              this.state.confirmDiscardChanges
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onConfirmDiscardChangesChanged}
          />
        </Row>
        <Row>
          <Checkbox
            label="Force pushing"
            value={
              this.state.confirmForcePush ? CheckboxValue.On : CheckboxValue.Off
            }
            onChange={this.onConfirmForcePushChanged}
          />
        </Row>
        <h2>Usage</h2>
        <Row>
          <Checkbox
            label={this.reportDesktopUsageLabel()}
            value={
              this.state.optOutOfUsageTracking
                ? CheckboxValue.Off
                : CheckboxValue.On
            }
            onChange={this.onReportingOptOutChanged}
          />
        </Row>
      </DialogContent>
    )
  }
}
