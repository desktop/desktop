import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'

interface IAdvancedPreferencesProps {
  readonly dispatcher: Dispatcher
}

interface IAdvancedPreferencesState {
  readonly reportingOptOut: boolean,
}

const SamplesURL = 'https://desktop.github.com/samples/'

export class Advanced extends React.Component<IAdvancedPreferencesProps, IAdvancedPreferencesState> {
  public constructor(props: IAdvancedPreferencesProps) {
    super(props)

    this.state = {
      reportingOptOut: false,
    }
  }

  public componentDidMount() {
    const optOut = this.props.dispatcher.getStatsOptOut()

    this.setState({
      reportingOptOut: optOut,
    })
  }

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked

    this.props.dispatcher.setStatsOptOut(!value)

    this.setState({
      reportingOptOut: !value,
    })
  }

  public render() {
    return (
      <DialogContent>
        <div>
          Would you like to help us improve GitHub Desktop by periodically submitting <LinkButton uri={SamplesURL}>anonymous usage data</LinkButton>?
        </div>

        <Checkbox
          label='Yes, submit anonymized usage data'
          value={this.state.reportingOptOut ? CheckboxValue.Off : CheckboxValue.On}
          onChange={this.onChange} />
      </DialogContent>
    )
  }
}
