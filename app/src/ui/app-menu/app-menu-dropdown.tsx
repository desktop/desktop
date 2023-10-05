/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import * as React from 'react'
import { rectEquals } from '../lib/rect'
import classNames from 'classnames'
import FocusTrap from 'focus-trap-react'
import { Options as FocusTrapOptions } from 'focus-trap'
import { TooltipTarget } from '../lib/tooltip'
import { Button } from '../lib/button'

export type DropdownState = 'open' | 'closed'

export interface IAppMenuDropdownProps {
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
   * A callback which is invoked when the button's context menu
   * is activated. The source event is passed along and can be
   * used to prevent the default action or stop the event from bubbling.
   */
  readonly onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void

  readonly onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void

  /**
   * A function that's called whenever something is dragged over the
   * dropdown.
   */
  readonly onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void

  /**
   * An optional classname that will be appended to the default
   * class name 'toolbar-button dropdown open|closed'
   */
  readonly className?: string

  /** Whether the dropdown will trap focus or not. Defaults to true. */
  readonly enableFocusTrap?: boolean

  /**
   * Whether the button should displays its disclosure arrow. Defaults to true.
   */
  readonly showDisclosureArrow?: boolean

  readonly tabIndex?: number

  readonly role?: string
  readonly buttonRole?: string

  /** Classes to be appended to `ToolbarButton` component */
  readonly buttonClassName?: string

  /**
   * Optional, custom overrided of the Tooltip components internal logic for
   * determining whether the tooltip target is overflowed or not.
   *
   * The internal overflow logic is simple and relies on the target itself
   * having the `text-overflow` CSS rule applied to it. In some scenarios
   * consumers may have a deep child element which is the one that should be
   * tested for overflow while still having the parent element be the pointer
   * device hit area.
   *
   * Consumers may pass a boolean if the overflowed state is known at render
   * time or they may pass a function which gets executed just before showing
   * the tooltip.
   */
  readonly isOverflowed?: ((target: TooltipTarget) => boolean) | boolean
}

interface IAppMenuDropdownState {
  readonly clientRect: ClientRect | null
}

export class AppMenuDropdown extends React.Component<
  IAppMenuDropdownProps,
  IAppMenuDropdownState
> {
  private innerButton: Button | null = null
  private rootDiv = React.createRef<HTMLDivElement>()
  private focusTrapOptions: FocusTrapOptions

  public constructor(props: IAppMenuDropdownProps) {
    super(props)
    this.state = { clientRect: null }

    this.focusTrapOptions = {
      allowOutsideClick: true,

      // Explicitly disable deactivation from the FocusTrap, since in that case
      // we would lose the "source" of the event (keyboard vs pointer).
      clickOutsideDeactivates: false,
      escapeDeactivates: false,
    }
  }

  private get isOpen() {
    return this.props.dropdownState === 'open'
  }

  private onToggleDropdownClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
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
    if (this.props.dropdownState === 'open' && this.rootDiv.current) {
      const newRect = this.rootDiv.current.getBoundingClientRect()
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
    const rect = this.state.clientRect
    if (!rect) {
      return undefined
    }

    const heightStyle: React.CSSProperties = {
      height: '100%',
      minWidth: rect.width,
    }

    return {
      position: 'absolute',
      marginLeft: rect.left,
      top: 0,
      ...heightStyle,
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
      <FocusTrap
        active={this.props.enableFocusTrap ?? true}
        focusTrapOptions={this.focusTrapOptions}
      >
        <div id="foldout-container" style={this.getFoldoutContainerStyle()}>
          <div
            className="overlay"
            tabIndex={-1}
            onClick={this.handleOverlayClick}
          />
          <div
            className="foldout"
            style={this.getFoldoutStyle()}
            tabIndex={-1}
            onKeyDown={this.onFoldoutKeyDown}
          >
            {this.props.dropdownContentRenderer()}
          </div>
        </div>
      </FocusTrap>
    )
  }

  private onButtonRef = (ref: Button | null) => {
    this.innerButton = ref
  }

  /**
   * Programmatically move keyboard focus to the button element.
   */
  public focusButton = () => {
    if (this.innerButton) {
      this.innerButton.focus()
    }
  }

  public render() {
    const className = classNames(
      'toolbar-dropdown',
      'foldout-style',
      this.props.dropdownState,
      this.props.className
    )

    const ariaExpanded = this.props.dropdownState === 'open'

    return (
      <div
        className={className}
        onKeyDown={this.props.onKeyDown}
        role={this.props.role}
        aria-expanded={ariaExpanded}
        onDragOver={this.props.onDragOver}
        ref={this.rootDiv}
      >
        {this.renderDropdownContents()}
        <div className="toolbar-button">
          <Button
            onClick={this.onToggleDropdownClick}
            ref={this.onButtonRef}
            onMouseEnter={this.props.onMouseEnter}
            tabIndex={this.props.tabIndex}
            role={this.props.buttonRole}
            ariaExpanded={ariaExpanded}
          >
            {this.props.children}
          </Button>
        </div>
      </div>
    )
  }
}
