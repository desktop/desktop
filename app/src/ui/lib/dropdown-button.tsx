import * as React from 'react'
import { Button } from './button'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'

interface IDropdownButtonProps {
  readonly buttonContent: JSX.Element | string
  readonly label: string
  readonly onClick?: () => void
  readonly onButtonRef?: (ref: HTMLButtonElement | null) => void
}

/**
 * A button that looks like a dropdown, used mainly to display a popover with
 * contents relative to it.
 */
export class DropdownButton extends React.Component<IDropdownButtonProps> {
  public render() {
    const { buttonContent, label, onClick, onButtonRef } = this.props

    return (
      <Button onClick={onClick} onButtonRef={onButtonRef}>
        <span className="popover-dropdown-button-label">{label}</span>
        <span className="button-content">{buttonContent}</span>
        <Octicon symbol={OcticonSymbol.triangleDown} />
      </Button>
    )
  }
}
