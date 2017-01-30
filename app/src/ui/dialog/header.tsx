import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { assertNever } from '../../lib/fatal-error'

interface IDialogHeaderProps {
  readonly title: string
  readonly dismissable: boolean
  readonly onDismissed?: () => void
  readonly type?: 'normal' | 'warning' | 'error'
}

export class DialogHeader extends React.Component<IDialogHeaderProps, any> {

  private onCloseButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.onDismissed) {
      this.props.onDismissed()
    }
  }

  private renderCloseButton() {
    if (!this.props.dismissable) {
      return null
    }

    return (
      <button className='close' tabIndex={-1} onClick={this.onCloseButtonClick}>
        <Octicon symbol={OcticonSymbol.x} />
      </button>
    )
  }

  private renderIcon() {
    if (this.props.type === undefined || this.props.type === 'normal') {
      return null
    } else if (this.props.type === 'error') {
      return <Octicon className='icon' symbol={OcticonSymbol.stop} />
    } else if (this.props.type === 'warning') {
      return <Octicon className='icon' symbol={OcticonSymbol.alert} />
    }

    return assertNever(this.props.type, `Unknown dialog header type ${this.props.type}`)
  }

  public render() {
    return (
      <header>
        {this.renderIcon()}
        <h1>{this.props.title}</h1>
        {this.renderCloseButton()}
      </header>
    )
  }
}
