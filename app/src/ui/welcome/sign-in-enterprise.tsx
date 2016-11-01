import * as React from 'react'
import { WelcomeStep } from './welcome'
import { Dispatcher } from '../../lib/dispatcher'

interface ISignInEnterpriseProps {
  readonly dispatcher: Dispatcher
  readonly advance: (step: WelcomeStep) => void
  readonly cancel: () => void
}

export class SignInEnterprise extends React.Component<ISignInEnterpriseProps, void> {
  public render() {
    return (
      <div>We can't do this yet!</div>
    )
  }
}
