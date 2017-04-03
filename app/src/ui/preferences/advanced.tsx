import * as React from 'react'
import { User } from '../../models/user'
import { DialogContent } from '../dialog'

interface IAdvancedProps {
  readonly reportingOptOut: boolean
  readonly user: User | null
}
export class Advanced extends React.Component<IAdvancedProps, void> {
  public render() {
    return (
      <DialogContent>
        <h2>Opt-out</h2>
        {this.props.reportingOptOut ? 'Track Me!' : 'no'}
        {this.props.user ? this.props.user.name : 'n/a'}
      </DialogContent>
    )
  }
}
