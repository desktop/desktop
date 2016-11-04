import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { assertNever } from '../../lib/fatal-error'
import { ToolbarButton } from './button'

export type DropdownState = 'open' | 'closed'

export interface IToolbarDropdownProps {
  /** The primary button text, describing its function */
  readonly title: string,

  /** An optional description of the function of the button */
  readonly description?: string,

  /** An optional symbol to be displayed next to the button text */
  readonly icon?: OcticonSymbol,

  /**
   * The state for of the drop down button.
   */
  readonly dropdownState: DropdownState

  /**
   * An event handler for when the drop down is opened
   * or closed by a pointer event or by hitting
   * space/enter while focused.
   */
  readonly onDropdownStateChanged: (state: DropdownState) => void

  /**
   * An render callback for when the dropdown is open.
   * Use this to render the contents of the fold out.
   */
  readonly dropdownContentRenderer: () => JSX.Element
}

interface IToolbarDropdownState {
  readonly clientRect: ClientRect | null
}

/**
 * A toolbar dropdown button
 */
export class ToolbarDropdown extends React.Component<IToolbarDropdownProps, IToolbarDropdownState> {

  private innerButton: ToolbarButton | null = null

  public constructor(props: IToolbarDropdownProps) {
    super(props)
    this.state = { clientRect: null }
  }

  private dropdownClassNames(): string | null {
    const state = this.props.dropdownState

    if (!state) {
      return null
    } else if (state === 'open') {
      return 'dropdown open'
    } else if (state === 'closed') {
      return 'dropdown closed'
    } else {
      return assertNever(state, `Unknown dropdown state ${state}`)
    }
  }

  private dropdownIcon(state: DropdownState): OcticonSymbol {
    // @TODO: Remake triangle octicon in a 12px version,
    // right now it's scaled badly on normal dpi monitors.
    if (state === 'open') {
      return OcticonSymbol.triangleUp
    } else if (state === 'closed') {
      return OcticonSymbol.triangleDown
    } else {
      return assertNever(state, `Unknown dropdown state ${state}`)
    }
  }

  private renderDropdownArrow(): JSX.Element | null {
    const state = this.props.dropdownState
    if (!state) {
      return null
    }

    return <Octicon symbol={this.dropdownIcon(state)} className='dropdownArrow' />
  }

  private onClick() {
    const newState: DropdownState = this.props.dropdownState === 'open'
      ? 'closed'
      : 'open'

    this.props.onDropdownStateChanged(newState)
  }

  private rectEquals(x: ClientRect, y: ClientRect) {
    return (
      x.left === y.left &&
      x.right === y.right &&
      x.top === y.top &&
      x.bottom === y.bottom &&
      x.width === y.width &&
      x.height === y.height
    )
  }

  private updateClientRectIfNecessary() {
    if (this.props.dropdownState  === 'open' && this.innerButton) {
      const buttonElement = this.innerButton.buttonElement
      if (buttonElement) {
        const newRect = buttonElement.getBoundingClientRect()
        const currentRect = this.state.clientRect

        if (!currentRect || !this.rectEquals(currentRect, newRect)) {
          this.setState({ clientRect: newRect })
        }
      }
    }
  }

  public componentDidMount() {
    this.updateClientRectIfNecessary()
  }

  public componentWillUnmount() {
    this.innerButton = null
  }

  public componentDidUpdate() {
    this.updateClientRectIfNecessary()
  }

  private handleOverlayClick() {
    this.props.onDropdownStateChanged('closed')
  }

  private getFoldoutContainerStyle(): React.CSSProperties | undefined {
    const rect = this.state.clientRect
    if (!rect) {
      return undefined
    }

    return {
      position: 'absolute',
      top: rect.bottom,
      left: 0,
      width: '100%',
      height: '100%',
    }
  }

  private getFoldoutStyle(): React.CSSProperties | undefined {
    const rect = this.state.clientRect
    if (!rect) {
      return undefined
    }

    return {
      position: 'absolute',
      marginLeft: rect.left,
      minWidth: rect.width,
      height: '100%',
      top: 0,
    }
  }

  private renderDropdownContents(): JSX.Element | null {
    if (this.props.dropdownState !== 'open') {
      return null
    }

    return (
      <div id='foldout-container' style={this.getFoldoutContainerStyle()}>
        <div className='overlay' onClick={() => this.handleOverlayClick}></div>
        <div className='foldout' style={this.getFoldoutStyle()}>
          {this.props.dropdownContentRenderer()}
        </div>
      </div>
    )
  }

  public render() {

    return (
      <ToolbarButton
        ref={(c) => this.innerButton = c}
        icon={this.props.icon}
        title={this.props.title}
        description={this.props.description}
        onClick={() => this.onClick()}
        className={this.dropdownClassNames() || undefined}
        preContentRenderer={() => this.renderDropdownContents()}
      >
        {this.renderDropdownArrow()}
      </ToolbarButton>
    )
  }
}
