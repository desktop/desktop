import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Form } from './form'
import { Button } from './button'

/** Text to let the user know their browser will send them back to GH Desktop */
export const BrowserRedirectMessage =
  "Your browser will redirect you back to GitHub Desktop once you've signed in. If your browser asks for your permission to launch GitHub Desktop please allow it to."

interface IAuthenticationFormProps {
  /**
   * A callback which is invoked if the user requests OAuth sign in using
   * their system configured browser.
   */
  readonly onBrowserSignInRequested: () => void

  /**
   * An array of additional buttons to render after the "Sign In" button.
   * (Usually, a 'cancel' button)
   */
  readonly additionalButtons?: ReadonlyArray<JSX.Element>
}

/** The GitHub authentication component. */
export class AuthenticationForm extends React.Component<IAuthenticationFormProps> {
  public render() {
    return (
      <Form className="sign-in-form" onSubmit={this.signInWithBrowser}>
        {this.renderEndpointRequiresWebFlow()}
      </Form>
    )
  }

  /**
   * Show a message informing the user they must sign in via the web flow
   * and a button to do so
   */
  private renderEndpointRequiresWebFlow() {
    return (
      <>
        {BrowserRedirectMessage}
        <Button
          type="submit"
          className="button-with-icon"
          onClick={this.signInWithBrowser}
          autoFocus={true}
          role="link"
        >
          Sign in using your browser
          <Octicon symbol={octicons.linkExternal} />
        </Button>
        {this.props.additionalButtons}
      </>
    )
  }

  private signInWithBrowser = (event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault()
    this.props.onBrowserSignInRequested()
  }
}
