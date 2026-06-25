import * as React from 'react'
import { Button } from './button'
import { Popover, PopoverAnchorPosition, PopoverDecoration } from './popover'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import classNames from 'classnames'
import { createUniqueId, releaseUniqueId } from './id-pool'

const maxPopoverContentHeight = 500

interface IPopoverDropdownProps {
  readonly className?: string
  readonly contentTitle: string
  readonly buttonContent: JSX.Element | string
  readonly buttonAriaLabel?: string
  readonly decoration?: PopoverDecoration
  readonly label?: string
  /**
   * The class name to apply to the open button. This is useful for
   * applying the dialog-preferred-focus class to the button when it
   * should receive focus ahead of a dialog's default focus target
   */
  readonly openButtonClassName?: string

  /**
   * The maximum height of the popover content in pixels. Defaults to
   * `maxPopoverContentHeight` (500px). Pass a smaller value to constrain the
   * popover to fit its contents when there are only a few items.
   **/
  readonly maxHeight?: number
}

interface IPopoverDropdownState {
  readonly showPopover: boolean
}

/**
 * A dropdown component for displaying a dropdown button that opens
 * a popover to display contents relative to the button content.
 */
export class PopoverDropdown extends React.Component<
  IPopoverDropdownProps,
  IPopoverDropdownState
> {
  private invokeButtonRef: HTMLButtonElement | null = null
  private dropdownHeaderId: string | undefined = undefined
  private dropdownContentId: string | undefined = undefined
  private openButtonId: string | undefined = undefined

  public constructor(props: IPopoverDropdownProps) {
    super(props)

    this.state = {
      showPopover: false,
    }
  }

  public componentWillUnmount() {
    if (this.dropdownHeaderId) {
      releaseUniqueId(this.dropdownHeaderId)
      this.dropdownHeaderId = undefined
    }

    if (this.dropdownContentId) {
      releaseUniqueId(this.dropdownContentId)
      this.dropdownContentId = undefined
    }

    if (this.openButtonId) {
      releaseUniqueId(this.openButtonId)
      this.openButtonId = undefined
    }
  }

  private getDropdownContentId() {
    this.dropdownContentId ??= createUniqueId('popover-dropdown-content')
    return this.dropdownContentId
  }

  private onInvokeButtonRef = (buttonRef: HTMLButtonElement | null) => {
    this.invokeButtonRef = buttonRef
  }

  private togglePopover = () => {
    this.setState({ showPopover: !this.state.showPopover })
  }

  public closePopover = () => {
    this.setState({ showPopover: false })
  }

  private renderPopover() {
    if (!this.state.showPopover) {
      return
    }

    const { contentTitle, decoration = PopoverDecoration.Balloon } = this.props
    this.dropdownHeaderId ??= createUniqueId('popover-dropdown-header')
    const dropdownContentId = this.getDropdownContentId()

    return (
      <Popover
        className="popover-dropdown-popover"
        anchor={this.invokeButtonRef}
        anchorPosition={PopoverAnchorPosition.BottomLeft}
        maxHeight={this.props.maxHeight ?? maxPopoverContentHeight}
        decoration={decoration}
        onClickOutside={this.closePopover}
        ariaLabelledby={this.dropdownHeaderId}
      >
        <div className="popover-dropdown-wrapper">
          <div className="popover-dropdown-header">
            <h3 id={this.dropdownHeaderId}>{contentTitle}</h3>

            <button
              className="close"
              onClick={this.closePopover}
              aria-label="Close"
            >
              <Octicon symbol={octicons.x} />
            </button>
          </div>
          <div id={dropdownContentId} className="popover-dropdown-content">
            {this.props.children}
          </div>
        </div>
      </Popover>
    )
  }

  public render() {
    const { className, buttonContent, label } = this.props
    const cn = classNames('popover-dropdown-component', className)
    this.openButtonId ??= createUniqueId('popover-open-button')
    const ariaControls = this.state.showPopover
      ? this.getDropdownContentId()
      : undefined

    return (
      <div className={cn}>
        {label && <label htmlFor={this.openButtonId}>{label}</label>}
        <Button
          onClick={this.togglePopover}
          onButtonRef={this.onInvokeButtonRef}
          id={this.openButtonId}
          className={this.props.openButtonClassName}
          ariaExpanded={this.state.showPopover}
          ariaHaspopup="dialog"
          ariaControls={ariaControls}
          ariaLabel={this.props.buttonAriaLabel}
        >
          <div className="button-content">{buttonContent}</div>
          <Octicon symbol={octicons.triangleDown} />
        </Button>
        {this.renderPopover()}
      </div>
    )
  }
}
