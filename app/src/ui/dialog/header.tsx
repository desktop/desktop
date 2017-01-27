import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'

interface IDialogHeaderProps {
  readonly title: string
  readonly dismissable: boolean
  readonly onDismissed?: () => void
}

export class DialogHeader extends React.Component<IDialogHeaderProps, any> {

  private onCloseButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.onDismissed) {
      this.props.onDismissed()
    }
  }

  private renderCloseButton() {
    return (
      <button className='close' tabIndex={-1} onClick={this.onCloseButtonClick}>
        <Octicon symbol={OcticonSymbol.x} />
      </button>
    )
  }

  public render() {
    const closeButton = this.props.dismissable
      ? this.renderCloseButton()
      : null

    return (
      <header>
        <h1>{this.props.title}</h1>
        {closeButton}
      </header>
    )
  }
}
