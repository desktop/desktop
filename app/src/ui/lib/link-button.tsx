import * as React from 'react'
import { shell } from 'electron'

interface ILinkButtonProps {
  /** A URI to open on click. */
  readonly uri?: string

  /** A function to call on click. */
  readonly onClick?: () => void

  /** The title of the button. */
  readonly children?: string
}

/** A link component. */
export class LinkButton extends React.Component<ILinkButtonProps, void> {
  public render() {
    return (
      <a className='link-button-component' href={this.props.uri || ''} onClick={e => this.onClick(e)}>{this.props.children}</a>
    )
  }

  private onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()

    const uri = this.props.uri
    if (uri) {
      shell.openExternal(uri)
    }

    const onClick = this.props.onClick
    if (onClick) {
      onClick()
    }
  }
}
