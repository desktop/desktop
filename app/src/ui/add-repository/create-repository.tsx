import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'

interface ICreateRepositoryProps {
  readonly dispatcher: Dispatcher
}

/** The Create New Repository component. */
export default class CreateRepository extends React.Component<ICreateRepositoryProps, void> {
  public render() {
    return (
      <div>Create repository goes here</div>
    )
  }
}
