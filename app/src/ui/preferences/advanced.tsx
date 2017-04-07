import * as React from 'react'
import { User } from '../../models/user'
import { DialogContent } from '../dialog'

interface IAdvancedPreferencesProps {
  readonly user: User | null
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

  private toggle = () => {
    const optOut = this.state.reportingOptOut

    if (optOut) {
      return this.setState({
        reportingOptOut: false,
      })
    }

    return this.setState({
      reportingOptOut: true,
    })
  }

  public render() {
    return (
      <DialogContent>
        <label>Opt-out of usage reporting</label>
        <input
          type='checkbox'
          checked={this.state.reportingOptOut}
          onChange={this.toggle} />
      </DialogContent>
    )
  }
}
