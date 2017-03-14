import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { assertNever } from '../../lib/fatal-error'
import { ToolbarButton, ToolbarButtonStyle } from './button'
import { rectEquals } from '../lib/rect'
import * as classNames from 'classnames'

export type DropdownState = 'open' | 'closed'

export interface IToolbarDropdownProps {
  /** The primary button text, describing its function */
  readonly title?: string

  /** An optional description of the function of the button */
  readonly description?: string | JSX.Element

  /** An optional symbol to be displayed next to the button text */
  readonly icon?: OcticonSymbol

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

  readonly onMouseEnter?: (event: React.MouseEvent<HTMLButtonElement>) => void
  readonly onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void

  /**
   * An render callback for when the dropdown is open.
   * Use this to render the contents of the fold out.
   */
  readonly dropdownContentRenderer: () => JSX.Element | null

  /**
   * An optional classname that will be appended to the default
   * class name 'toolbar-button dropdown open|closed'
   */
  readonly className?: string

  /** The class name for the icon element. */
  readonly iconClassName?: string

  /** The button's style. Defaults to `ToolbarButtonStyle.Standard`. */
  readonly style?: ToolbarButtonStyle

  /**
   * Sets the styles for the dropdown's foldout. Useful for custom positioning
   * and sizes.
   */
  readonly foldoutStyle?: React.CSSProperties

  /**
   * Whether the button should displays its disclosure arrow. Defaults to true.
   */
  readonly showDisclosureArrow?: boolean

  /** Whether the button is disabled. Defaults to false. */
  readonly disabled?: boolean
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
    if (this.props.showDisclosureArrow === false) { return null }

    const state = this.props.dropdownState

    return <Octicon symbol={this.dropdownIcon(state)} className='dropdownArrow' />
  }

  private onClick = () => {
    const newState: DropdownState = this.props.dropdownState === 'open'
      ? 'closed'
      : 'open'

    this.props.onDropdownStateChanged(newState)
  }

  private updateClientRectIfNecessary() {
    if (this.props.dropdownState  === 'open' && this.innerButton) {
      const buttonElement = this.innerButton.buttonElement
      if (buttonElement) {
        const newRect = buttonElement.getBoundingClientRect()
        const currentRect = this.state.clientRect

        if (!currentRect || !rectEquals(currentRect, newRect)) {
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

  public componentDidUpdate = () => {
    this.updateClientRectIfNecessary()
  }

  private handleOverlayClick = () => {
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
      height: `calc(100% - ${rect.bottom}px)`,
    }
  }

  private getFoldoutStyle(): React.CSSProperties | undefined {
    if (this.props.foldoutStyle) {
      return this.props.foldoutStyle
    }

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

  private renderDropdownContents = (): JSX.Element | null => {
    if (this.props.dropdownState !== 'open') {
      return null
    }

    return (
      <div id='foldout-container' style={this.getFoldoutContainerStyle()}>
        <div className='overlay' onClick={this.handleOverlayClick}></div>
        <div className='foldout' style={this.getFoldoutStyle()}>
          {this.props.dropdownContentRenderer()}
        </div>
      </div>
    )
  }

  private onRef = (ref: ToolbarButton) => {
    this.innerButton = ref
  }

  public render() {

    const className = classNames(
      'dropdown',
      this.props.dropdownState,
      this.props.className
    )

    return (
      <ToolbarButton
        ref={this.onRef}
        icon={this.props.icon}
        title={this.props.title}
        description={this.props.description}
        onClick={this.onClick}
        onMouseEnter={this.props.onMouseEnter}
        className={className}
        preContentRenderer={this.renderDropdownContents}
        style={this.props.style}
        iconClassName={this.props.iconClassName}
        disabled={this.props.disabled}
        onKeyDown={this.props.onKeyDown}
      >
        {this.props.children}
        {this.renderDropdownArrow()}
      </ToolbarButton>
    )
  }
}
