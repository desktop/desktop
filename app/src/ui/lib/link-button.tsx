import * as React from 'react'
import { shell } from '../../lib/app-shell'
import classNames from 'classnames'
import { Tooltip } from './tooltip'
import { createObservableRef } from './observable-ref'

interface ILinkButtonProps {
  /** A URI to open on click. */
  readonly uri?: string

  /** A function to call on click. */
  readonly onClick?: () => void

  /** A function to call when mouse is hovered over */
  readonly onMouseOver?: () => void

  /** A function to call when mouse is moved off */
  readonly onMouseOut?: () => void

  /** CSS classes attached to the component */
  readonly className?: string

  /** The tab index of the anchor element. */
  readonly tabIndex?: number

  /** Disable the link from being clicked */
  readonly disabled?: boolean

  /** title-text or tooltip for the link */
  readonly title?: string

  /** aria-label for the link */
  readonly ariaLabel?: string
}

/**
 * A link component.
 *
 * Provide `children` elements for the title of the rendered hyperlink.
 */
export class LinkButton extends React.Component<ILinkButtonProps, {}> {
  private readonly anchorRef = createObservableRef<HTMLAnchorElement>()

  public render() {
    const href = this.props.uri || ''
    const className = classNames('link-button-component', this.props.className)
    const { title } = this.props

    return (
      // eslint-disable-next-line jsx-a11y/mouse-events-have-key-events
      <a
        ref={this.anchorRef}
        className={className}
        href={href}
        onMouseOver={this.props.onMouseOver}
        onMouseOut={this.props.onMouseOut}
        onClick={this.onClick}
        tabIndex={this.props.tabIndex}
        aria-label={this.props.ariaLabel}
      >
        {title && <Tooltip target={this.anchorRef}>{title}</Tooltip>}
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
