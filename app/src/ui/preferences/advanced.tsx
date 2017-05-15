import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { SamplesURL } from '../../lib/stats'

interface IAdvancedPreferencesProps {
  readonly isOptedOut: boolean,
  readonly onOptOutSet: (checked: boolean) => void
}

interface IAdvancedPreferencesState {
  readonly reportingOptOut: boolean
}

export class Advanced extends React.Component<IAdvancedPreferencesProps, IAdvancedPreferencesState> {
  public constructor(props: IAdvancedPreferencesProps) {
    super(props)

    this.state = {
      reportingOptOut: this.props.isOptedOut,
    }
  }

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const value = !event.currentTarget.checked

    this.setState({ reportingOptOut: value })
    this.props.onOptOutSet(value)
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
          onChange={this.onChange} />
      </DialogContent>
    )
  }
}
