import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'

interface IStartProps {
  readonly dispatcher: Dispatcher
  readonly advance: () => void
  readonly cancel: () => void
}

export class Start extends React.Component<IStartProps, void> {
  public render() {
    return (
      <div></div>
    )
  }
}
