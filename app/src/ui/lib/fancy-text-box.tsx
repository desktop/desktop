import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { TextBox, ITextBoxProps } from './text-box'
import * as classNames from 'classnames'

interface IFancyTextBoxProps extends ITextBoxProps {
  /** Icon to render */
  readonly symbol: OcticonSymbol

  /** Callback used to get a reference to internal TextBox */
  readonly onRef: (textbox: TextBox) => void
}

interface IFancyTextBoxState {
  readonly isFocused: boolean
}

export class FancyTextBox extends React.Component<
  IFancyTextBoxProps,
  IFancyTextBoxState
> {
  public constructor(props: IFancyTextBoxProps) {
    super(props)

    this.state = { isFocused: false }
  }

  public render() {
    const componentCSS = classNames(
      'fancy-text-box-component',
      this.props.className,
      { disabled: this.props.disabled },
      { focused: this.state.isFocused }
    )
    const octiconCSS = classNames('fancy-octicon')

    return (
      <div className={componentCSS}>
        <Octicon className={octiconCSS} symbol={this.props.symbol} />
        <TextBox
          {...this.props}
          onFocus={this.onFocus}
          onBlur={this.onBlur}
          ref={this.props.onRef}
        />
      </div>
    )
  }

  private onFocus = () => {
    if (this.props.onFocus !== undefined) {
      this.props.onFocus()
    }

    this.setState({ isFocused: true })
  }

  private onBlur = () => {
    if (this.props.onBlur !== undefined) {
      this.props.onBlur()
    }

    this.setState({ isFocused: false })
  }
}
