import * as React from 'react'
import { WelcomeStep } from './welcome'

interface ISignInEnterpriseProps {
  readonly advance: (step: WelcomeStep) => void
  readonly cancel: () => void
}

/** The Welcome flow step to login to an Enterprise instance. */
export class SignInEnterprise extends React.Component<ISignInEnterpriseProps, void> {
  public render() {
    return (
      <div>
        <h1>We can't do this yet!</h1>

        <div className='actions'>
          <button onClick={() => this.everSoSorry()}>Ever so sorry</button>
        </div>
      </div>
    )
  }

  private everSoSorry() {
    this.props.advance(WelcomeStep.Start)
  }
}
