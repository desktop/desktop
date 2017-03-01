import * as React from 'react'
import { Loading } from './loading'
import { Button } from './button'
import { TextBox } from './text-box'
import { Form } from './form'
import { Errors } from './errors'

interface ITwoFactorAuthenticationProps {

  /**
   * A callback which is invoked once the user has entered a
   * OTP token and submitted it either by clicking on the submit
   * button or by submitting the form through other means (ie hitting Enter).
   */
  readonly onOTPEntered: (otp: string) => void

  /**
   * An error which, if present, is presented to the
   * user in close proximity to the actions or input fields
   * related to the current step.
   */
  readonly error: Error | null

  /**
   * A value indicating whether or not the sign in store is
   * busy processing a request. While this value is true all
   * form inputs and actions save for a cancel action will
   * be disabled.
   */
  readonly loading: boolean
}

interface ITwoFactorAuthenticationState {
  readonly otp: string
}

/** The two-factor authentication component. */
export class TwoFactorAuthentication extends React.Component<ITwoFactorAuthenticationProps, ITwoFactorAuthenticationState> {
  public constructor(props: ITwoFactorAuthenticationProps) {
    super(props)

    this.state = { otp: '' }
  }

  public render() {
    const textEntryDisabled = this.props.loading
    const signInDisabled = !this.state.otp.length || this.props.loading
    const errors =  this.props.error
      ? <Errors>{this.props.error.message}</Errors>
      : null

    return (
      <div>
        <p className='welcome-text'>
          Open the two-factor authentication app on your device to view your
          authentication code and verify your identity.
        </p>

        <Form onSubmit={this.signIn}>
          <TextBox
            label='Authentication code'
            disabled={textEntryDisabled}
            autoFocus={true}
            onChange={this.onOTPChange}/>

          {errors}

          <Button type='submit' disabled={signInDisabled}>Verify</Button>

          {this.props.loading ? <Loading/> : null}
        </Form>
      </div>
    )
  }

  private onOTPChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ otp: event.currentTarget.value })
  }

  private signIn = () => {
    this.props.onOTPEntered(this.state.otp)
  }
}
