const authenticatorAppWelcomeText =
  'Open the two-factor authentication app on your device to view your authentication code and verify your identity.'
const smsMessageWelcomeText =
  'We just sent you a message via SMS with your authentication code. Enter the code in the form below to verify your identity.'

/**
 * When authentication is requested via 2FA, the endpoint provides
 * a hint in the response header as to where the user should look
 * to retrieve the token.
 */
export enum AuthenticationMode {
  /*
   * User should authenticate via a received text message.
   */
  Sms,
  /*
   * User should open TOTP mobile application and obtain code.
   */
  App,
}

export function getWelcomeMessage(type: AuthenticationMode): string {
  return type === AuthenticationMode.Sms
    ? smsMessageWelcomeText
    : authenticatorAppWelcomeText
}
