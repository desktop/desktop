import * as React from 'react'
import { Button } from './button'
import { Popover, PopoverAnchorPosition, PopoverDecoration } from './popover'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import classNames from 'classnames'

const maxPopoverContentHeight = 500

interface IPopoverDropdownProps {
  readonly className?: string
  readonly contentTitle: string
  readonly buttonContent: JSX.Element | string
  readonly label: string
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

  public constructor(props: IPopoverDropdownProps) {
    super(props)

    this.state = {
      showPopover: false,
    }
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

    const { contentTitle } = this.props

    return (
      <Popover
        className="popover-dropdown-popover"
        anchor={this.invokeButtonRef}
        anchorPosition={PopoverAnchorPosition.BottomLeft}
        maxHeight={maxPopoverContentHeight}
        decoration={PopoverDecoration.Balloon}
        onClickOutside={this.closePopover}
        ariaLabelledby="popover-dropdown-header"
      >
        <div className="popover-dropdown-wrapper">
          <div className="popover-dropdown-header">
            <h3 id="popover-dropdown-header">{contentTitle}</h3>

            <button
              className="close"
              onClick={this.closePopover}
              aria-label="Close"
            >
              <Octicon symbol={octicons.x} />
            </button>
          </div>
          <div className="popover-dropdown-content">{this.props.children}</div>
        </div>
      </Popover>
    )
  }

  public render() {
    const { className, buttonContent, label } = this.props
    const cn = classNames('popover-dropdown-component', className)

    return (
      <div className={cn}>
        <Button
          onClick={this.togglePopover}
          onButtonRef={this.onInvokeButtonRef}
        >
          <span className="popover-dropdown-button-label">{label}</span>
          <span className="button-content">{buttonContent}</span>
          <Octicon symbol={octicons.triangleDown} />
        </Button>
        {this.renderPopover()}
      </div>
    )
  }
}
