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

  /** The tooltip for the button. */
  readonly tooltip?: string

  /** An optional symbol to be displayed next to the button text */
  readonly icon?: OcticonSymbol

  /**
   * The state for of the drop down button.
   */
  readonly dropdownState: DropdownState

  /**
   * An event handler for when the drop down is opened, or closed, by a pointer
   * event or by pressing the space or enter key while focused.
   *
   * @param state    - The new state of the drop down
   * @param source   - Whether the state change was caused by a keyboard or
   *                   pointer interaction.
   */
  readonly onDropdownStateChanged: (
    state: DropdownState,
    source: 'keyboard' | 'pointer'
  ) => void

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
   * An optional progress value as a fraction between 0 and 1. Passing a number
   * greater than zero will render a progress bar background in the toolbar
   * button. Use this to communicate an ongoing operation.
   *
   * Consumers should not rely solely on the visual progress bar, they should
   * also implement alternative representation such as showing a percentage
   * text in the description or title along with information about what
   * operation is currently in flight.
   */
  readonly progressValue?: number

  readonly role?: string
  readonly buttonRole?: string
}

interface IToolbarDropdownState {
  readonly clientRect: ClientRect | null
}

/**
 * A toolbar dropdown button
 */
export class ToolbarDropdown extends React.Component<
  IToolbarDropdownProps,
  IToolbarDropdownState
  > {
  private innerButton: ToolbarButton | null = null

  public constructor(props: IToolbarDropdownProps) {
    super(props)
    this.state = { clientRect: null }
  }

  private get isOpen() {
    return this.props.dropdownState === 'open'
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
    if (this.props.showDisclosureArrow === false) {
      return null
    }

    const state = this.props.dropdownState

    return (
      <Octicon symbol={this.dropdownIcon(state)} className="dropdownArrow" />
    )
  }

  private onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const newState: DropdownState =
      this.props.dropdownState === 'open' ? 'closed' : 'open'

    // This is probably one of the hackiest things I've ever done.
    // We need to be able to determine whether the button was clicked
    // using a pointer device or activated by pressing Enter or Space.
    // The problem is that button onClick events fire with a mouse event
    // regardless of whether they were activated with a key press or a
    // pointer device. So far, the only way I've been able to tell the
    // two apart is that keyboard derived clicks don't have a pointer
    // position.
    const source = !event.clientX && !event.clientY ? 'keyboard' : 'pointer'

    this.props.onDropdownStateChanged(newState, source)
  }

  private updateClientRectIfNecessary() {
    if (this.props.dropdownState === 'open' && this.innerButton) {
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

  public componentDidUpdate() {
    this.updateClientRectIfNecessary()
  }

  private handleOverlayClick = () => {
    this.props.onDropdownStateChanged('closed', 'pointer')
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

  private onFoldoutKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!event.defaultPrevented && this.isOpen && event.key === 'Escape') {
      event.preventDefault()
      this.props.onDropdownStateChanged('closed', 'keyboard')
    }
  }

  private renderDropdownContents = (): JSX.Element | null => {
    if (this.props.dropdownState !== 'open') {
      return null
    }

    // The overlay has a -1 tab index because if it doesn't then focus will be put
    // on the body element when someone clicks on it and that causes the app menu
    // bar to instantly close before even receiving the onDropdownStateChanged
    // event from us.
    return (
      <div id="foldout-container" style={this.getFoldoutContainerStyle()}>
        <div
          className="overlay"
          tabIndex={-1}
          onClick={this.handleOverlayClick}
        />
        <div
          className="foldout"
          style={this.getFoldoutStyle()}
          tabIndex={0}
          onKeyDown={this.onFoldoutKeyDown}
        >
          {this.props.dropdownContentRenderer()}
        </div>
      </div>
    )
  }

  private onRef = (ref: ToolbarButton | null) => {
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

  public render() {
    const className = classNames(
      'toolbar-dropdown',
      this.props.dropdownState,
      this.props.className
    )

    const ariaExpanded = this.props.dropdownState === 'open' ? 'true' : 'false'

    return (
      <div
        className={className}
        onKeyDown={this.props.onKeyDown}
        role={this.props.role}
        aria-expanded={ariaExpanded}
      >
        {this.renderDropdownContents()}
        <ToolbarButton
          ref={this.onRef}
          icon={this.props.icon}
          title={this.props.title}
          description={this.props.description}
          tooltip={this.props.tooltip}
          onClick={this.onClick}
          onMouseEnter={this.props.onMouseEnter}
          style={this.props.style}
          iconClassName={this.props.iconClassName}
          disabled={this.props.disabled}
          tabIndex={this.props.tabIndex}
          progressValue={this.props.progressValue}
          role={this.props.buttonRole}
        >
          {this.props.children}
          {this.renderDropdownArrow()}
        </ToolbarButton>
      </div>
    )
  }
}
