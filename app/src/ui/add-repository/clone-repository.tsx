import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'

interface ICloneRepositoryProps {
  readonly dispatcher: Dispatcher
}

export default class CloneRepository extends React.Component<ICloneRepositoryProps, void> {
  public render() {
    return (
      <div>Clone repository goes here</div>
    )
  }
}
