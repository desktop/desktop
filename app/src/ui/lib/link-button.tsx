import * as React from 'react'
import { shell } from 'electron'
import * as classNames from 'classnames'

interface ILinkButtonProps extends React.HTMLProps<HTMLAnchorElement> {
  /** A URI to open on click. */
  readonly uri?: string

  /** A function to call on click. */
  readonly onClick?: () => void

  /** The title of the button. */
  readonly children?: string

  /** CSS classes attached to the component */
  readonly className?: string

  /** The tab index of the anchor element. */
  readonly tabIndex?: number

  /** Disable the link from being clicked */
  readonly disabled?: boolean
}

/** A link component. */
export class LinkButton extends React.Component<ILinkButtonProps, void> {
  public render() {
    const { uri, className, ...otherProps } = this.props
    const href = uri || ''
    const props = { ...otherProps, className: classNames('link-button-component', className), onClick: this.onClick, href }

    return (
      <a {...props}>
        {this.props.children}
      </a>
    )
  }

  private onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()

    if (this.props.disabled) {
      return
    }

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
