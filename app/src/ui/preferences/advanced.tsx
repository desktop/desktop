import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface IAdvancedPreferencesProps {
  readonly dispatcher: Dispatcher
}

interface IAdvancedPreferencesState {
  readonly reportingOptOut: boolean,
}

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
        <Checkbox
          label='Opt-out of usage reporting'
          value={this.state.reportingOptOut ? CheckboxValue.Off : CheckboxValue.On}
          onChange={this.onChange} />
      </DialogContent>
    )
  }
}
