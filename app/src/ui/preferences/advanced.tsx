import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'

interface IAdvancedPreferencesProps {
  readonly isOptedOut: boolean,
  readonly confirmRepoRemoval: boolean,
  readonly onOptOutSet: (checked: boolean) => void
  readonly onConfirmRepoRemovalSet: (checked: boolean) => void
}

interface IAdvancedPreferencesState {
  readonly reportingOptOut: boolean
  readonly confirmRepoRemoval: boolean
}

const SamplesURL = 'https://desktop.github.com/samples/'

export class Advanced extends React.Component<IAdvancedPreferencesProps, IAdvancedPreferencesState> {
  public constructor(props: IAdvancedPreferencesProps) {
    super(props)

    this.state = {
      reportingOptOut: this.props.isOptedOut,
      confirmRepoRemoval: this.props.confirmRepoRemoval,
    }
  }

  private onReportingOptOutChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const value = !event.currentTarget.checked

    this.setState({ reportingOptOut: value })
    this.props.onOptOutSet(value)
  }

  private onConfirmRepoRemovalChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked

    this.setState({ confirmRepoRemoval: value })
    this.props.onConfirmRepoRemovalSet(value)
  }

  public render() {
    return (
      <DialogContent>
        <div>
          Would you like to help us improve GitHub Desktop by periodically submitting <LinkButton uri={SamplesURL}>anonymous usage data</LinkButton>?
        </div>

        <br />

        <Checkbox
          label='Yes, submit anonymized usage data'
          value={this.state.reportingOptOut ? CheckboxValue.Off : CheckboxValue.On}
          onChange={this.onReportingOptOutChanged} />
        <Checkbox
          label='Yes, confirm before repository removal'
          value={this.state.confirmRepoRemoval ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onConfirmRepoRemovalChanged} />
      </DialogContent>
    )
  }
}
