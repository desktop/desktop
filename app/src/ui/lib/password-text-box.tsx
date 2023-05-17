import * as React from 'react'
import { ITextBoxProps, TextBox } from './text-box'
import { Button } from './button'
import classNames from 'classnames'

interface IPasswordTextBoxState {
  /**
   * Whether or not the password is currently visible in the underlying input
   */
  readonly showPassword: boolean
}

/** An password input element with app-standard styles and a button for toggling
 * the visibility of the user password. */
export class PasswordTextBox extends React.Component<
  ITextBoxProps,
  IPasswordTextBoxState
> {
  private textBoxRef = React.createRef<TextBox>()

  public constructor(props: ITextBoxProps) {
    super(props)

    this.state = { showPassword: false }
  }

  private onTogglePasswordVisibility = () => {
    this.setState({ showPassword: !this.state.showPassword })
    this.textBoxRef.current!.focus()
  }

  public render() {
    const buttonText = this.state.showPassword
      ? 'Hide Password'
      : 'Show Password'
    const type = this.state.showPassword ? 'text' : 'password'
    const className = classNames('password-text-box', this.props.className)
    const props: ITextBoxProps = { ...this.props, ...{ type, className } }
    return (
      <TextBox {...props} ref={this.textBoxRef}>
        <Button onClick={this.onTogglePasswordVisibility}>{buttonText}</Button>
      </TextBox>
    )
  }
}
