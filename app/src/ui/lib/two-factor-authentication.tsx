import * as React from 'react'
import { Loading } from './loading'
import { Button } from './button'
import { TextBox } from './text-box'
import { Form } from './form'
import { Errors } from './errors'

interface ITwoFactorAuthenticationProps {

  readonly onOTPEntered: (otp: string) => void

  readonly loading: boolean
  readonly error: Error | null
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

          {this.renderError()}

          <Button type='submit' disabled={signInDisabled}>Verify</Button>

          {this.props.loading ? <Loading/> : null}
        </Form>
      </div>
    )
  }

  private renderError() {
    const error = this.props.error
    if (!error) { return null }

    return <Errors>{error.message}</Errors>
  }

  private onOTPChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ otp: event.currentTarget.value })
  }

  private signIn = () => {
    this.props.onOTPEntered(this.state.otp)
  }
}
