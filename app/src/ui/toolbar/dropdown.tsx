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

  /**
   * A function that's called when the user hovers over the button with
   * a pointer device. Note that this only fires for mouse events inside
   * the button and not when hovering content inside the foldout.
   */
  readonly onMouseEnter?: (event: React.MouseEvent<HTMLButtonElement>) => void

  /**
   * A function that's called when a key event is received from the 
   * ToolbarDropDown component or any of its descendants.
   * 
   * Consumers of this event should not act on the event if the event has
   * had its default action prevented by an earlier consumer that's called
   * the preventDefault method on the event instance.
   */
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

  /**
   * The tab index of the button element.
   *
   * A value of 'undefined' means that whether or not the element participates
   * in sequential keyboard navigation is left to the user agent's default
   * settings.
   * 
   * A negative value means that the element can receive focus but not
   * through sequential keyboard navigation (i.e. only via programmatic
   * focus)
   * 
   * A value of zero means that the element can receive focus through
   * sequential keyboard navigation and that the order should be determined
   * by the element's position in the DOM.
   * 
   * A positive value means that the element can receive focus through
   * sequential keyboard navigation and that it should have the explicit
   * order provided and not have it be determined by its position in the DOM.
   *
   * Note: A positive value should be avoided if at all possible as it's
   * detrimental to accessibility in most scenarios.
   */
  readonly tabIndex?: number

  /**
   * A function that's called when the button element receives keyboard focus.
   */
  readonly onButtonFocus?: (event: React.FocusEvent<HTMLButtonElement>) => void

  /**
   * A function that's called when the button element looses keyboard focus.
   */
  readonly onButtonBlur?: (event: React.FocusEvent<HTMLButtonElement>) => void
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
      const newRect = this.innerButton.getButtonBoundingClientRect()
      if (newRect) {
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

  /**
   * Programmatically move keyboard focus to the button element.
   */
  public focusButton = () => {
    if (this.innerButton) {
      this.innerButton.focusButton()
    }
  }

  /**
   * Programmatically remove keyboard focus from the button element.
   */
  public blurButton() {
    if (this.innerButton) {
      this.innerButton.blurButton()
    }
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
        tabIndex={this.props.tabIndex}
        onButtonFocus={this.props.onButtonFocus}
        onButtonBlur={this.props.onButtonBlur}
      >
        {this.props.children}
        {this.renderDropdownArrow()}
      </ToolbarButton>
    )
  }
}
