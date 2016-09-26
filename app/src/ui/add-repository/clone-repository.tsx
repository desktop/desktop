import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'

interface ICloneRepositoryProps {
  readonly dispatcher: Dispatcher
}

/** The component for cloning an existing GitHub repository. */
export class CloneRepository extends React.Component<ICloneRepositoryProps, void> {
  public render() {
    return (
      <div>Clone repository goes here</div>
    )
  }
}
