import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import * as classNames from 'classnames'
import { assertNever } from '../../lib/fatal-error'
import { Button } from '../lib/button'

/** The button style. */
export enum ToolbarButtonStyle {
  /** The default style with the description above the title. */
  Standard,

  /** A style in which the description is below the title. */
  Subtitle,
}

export interface IToolbarButtonProps {
  /** The primary button text, describing its function */
  readonly title?: string

  /** An optional description of the function of the button */
  readonly description?: JSX.Element | string

  /** An optional symbol to be displayed next to the button text */
  readonly icon?: OcticonSymbol

  /** The class name for the icon element. */
  readonly iconClassName?: string

  /**
   * An optional event handler for when the button is activated
   * by a pointer event or by hitting space/enter while focused.
   */
  readonly onClick?: () => void

  /**
   * An optional classname that will be appended to the default
   * class name 'toolbar-button'
   */
  readonly className?: string

  /**
   * An optional callback for rendering content inside the
   * button, just before the content wrapper. Used by the
   * dropdown component to render the foldout.
   */
  readonly preContentRenderer?: () => JSX.Element | null

  /** The button's style. Defaults to `ToolbarButtonStyle.Standard`. */
  readonly style?: ToolbarButtonStyle

  /** Whether the button's disabled. Defaults to false. */
  readonly disabled?: boolean
}

/**
 * A general purpose toolbar button
 */
export class ToolbarButton extends React.Component<IToolbarButtonProps, void> {

  public buttonElement: HTMLButtonElement | null = null

  private onClick = () => {
    if (this.props.onClick) {
      this.props.onClick()
    }
  }

  private onButtonRef = (ref: HTMLButtonElement) => {
    this.buttonElement = ref
  }

  public render() {
    const icon = this.props.icon
      ? <Octicon symbol={this.props.icon} className={classNames('icon', this.props.iconClassName)} />
      : null

    const className = classNames('toolbar-button', this.props.className)

    const preContentRenderer = this.props.preContentRenderer
    const preContent = preContentRenderer && preContentRenderer()

    return (
      <div className={className}>
        {preContent}
        <Button onClick={this.onClick} onButtonRef={this.onButtonRef} disabled={this.props.disabled}>
          {icon}
          {this.renderText()}
          {this.props.children}
        </Button>
      </div>
    )
  }

  private renderText() {

    if (!this.props.title && !this.props.description) {
      return null
    }

    const title = this.props.title
      ? <div className='title'>{this.props.title}</div>
      : null

    const description = this.props.description
      ? <div className='description'>{this.props.description}</div>
      : null

    const style = this.props.style || ToolbarButtonStyle.Standard
    switch (style) {
      case ToolbarButtonStyle.Standard:
        return (
          <div className='text'>
            {title}
            {description}
          </div>
        )

      case ToolbarButtonStyle.Subtitle:
        return (
          <div className='text'>
            {description}
            <div className='title'>{this.props.title}</div>
          </div>
        )

      default:
        return assertNever(style, `Unknown button style: ${style}`)
    }
  }
}
