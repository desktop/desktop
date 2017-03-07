export const authenticatorAppWelcomeText = 'Open the two-factor authentication app on your device to view your authentication code and verify your identity.'
export const smsMessageWelcomeText = 'We just sent you a message via SMS with your authentication code. Enter the code in the form below to verify your identity.'

/**
 * When authentication is requested via 2FA, the endpoint provides
 * a hint in the response header as to where the user should look
 * to retrieve the token.
 *
 * Currently supported modes are 'sms' (text message) and 'app'
 * (TOTP mobile app)
 */
export type AuthenticationMode = 'sms' | 'app'
