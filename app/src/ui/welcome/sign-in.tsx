import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'

interface ISignInProps {
  readonly dispatcher: Dispatcher
  readonly advance: () => void
  readonly cancel: () => void
}

export class SignIn extends React.Component<ISignInProps, void> {
  public render() {
    return (
      <div></div>
    )
  }
}
