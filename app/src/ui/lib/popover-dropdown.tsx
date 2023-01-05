import * as React from 'react'
import { Button } from './button'
import { Popover, PopoverCaretPosition } from './popover'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import classNames from 'classnames'

const defaultPopoverContentHeight = 300
const maxPopoverContentHeight = 500

interface IPopoverDropdownProps {
  readonly className?: string
  readonly contentTitle: string
  readonly buttonContent: JSX.Element | string
  readonly label: string
}

interface IPopoverDropdownState {
  readonly showPopover: boolean
  readonly popoverContentHeight: number
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
      popoverContentHeight: defaultPopoverContentHeight,
    }
  }

  public componentDidMount() {
    this.calculateDropdownListHeight()
  }

  public componentDidUpdate() {
    this.calculateDropdownListHeight()
  }

  private calculateDropdownListHeight = () => {
    if (this.invokeButtonRef === null) {
      return
    }

    const windowHeight = window.innerHeight
    const bottomOfButton = this.invokeButtonRef.getBoundingClientRect().bottom
    const listHeaderHeight = 75
    const calcMaxHeight = Math.round(
      windowHeight - bottomOfButton - listHeaderHeight
    )

    const popoverContentHeight =
      calcMaxHeight > maxPopoverContentHeight
        ? maxPopoverContentHeight
        : calcMaxHeight
    if (popoverContentHeight !== this.state.popoverContentHeight) {
      this.setState({ popoverContentHeight })
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
    const { popoverContentHeight } = this.state
    const contentStyle = { height: `${popoverContentHeight}px` }

    return (
      <Popover
        className="popover-dropdown-popover"
        caretPosition={PopoverCaretPosition.TopLeft}
        onClickOutside={this.closePopover}
      >
        <div className="popover-dropdown-header">
          {contentTitle}
          <button
            className="close"
            onClick={this.closePopover}
            aria-label="close"
          >
            <Octicon symbol={OcticonSymbol.x} />
          </button>
        </div>
        <div className="popover-dropdown-content" style={contentStyle}>
          {this.props.children}
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
          <Octicon symbol={OcticonSymbol.triangleDown} />
        </Button>
        {this.renderPopover()}
      </div>
    )
  }
}
