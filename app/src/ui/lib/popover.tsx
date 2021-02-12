import * as React from 'react'
import FocusTrap from 'focus-trap-react'
import { Options as FocusTrapOptions } from 'focus-trap'

interface IPopoverProps {
  readonly onClickOutside: () => void
}

export class Popover extends React.Component<IPopoverProps> {
  private focusTrapOptions: FocusTrapOptions
  private divRef = React.createRef<HTMLDivElement>()

  public constructor(props: IPopoverProps) {
    super(props)

    this.focusTrapOptions = {
      allowOutsideClick: true,
      escapeDeactivates: true,
      onDeactivate: this.props.onClickOutside,
    }
  }

  public componentDidMount() {
    document.addEventListener('mousedown', this.onDocumentMouseDown)
  }

  public componentWillUnmount() {
    document.removeEventListener('mousedown', this.onDocumentMouseDown)
  }

  private onDocumentMouseDown = (event: MouseEvent) => {
    const { current: ref } = this.divRef
    const { target } = event

    if (
      ref !== null &&
      ref.parentElement !== null &&
      target instanceof Node &&
      !ref.parentElement.contains(target)
    ) {
      this.props.onClickOutside()
    }
  }

  public render() {
    return (
      <FocusTrap active={true} focusTrapOptions={this.focusTrapOptions}>
        <div className="popover-component" ref={this.divRef}>
          {this.props.children}
        </div>
      </FocusTrap>
    )
  }
}
