/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { assertNever } from '../../lib/fatal-error'
import { ToolbarButton, ToolbarButtonStyle } from './button'
import { rectEquals } from '../lib/rect'
import classNames from 'classnames'
import FocusTrap from 'focus-trap-react'
import { Options as FocusTrapOptions } from 'focus-trap'
import { TooltipTarget } from '../lib/tooltip'
import { AriaHasPopupType } from '../lib/aria-types'
import { enableResizingToolbarButtons } from '../../lib/feature-flag'

export type DropdownState = 'open' | 'closed'

/** Represents the style of the dropdown */
export enum ToolbarDropdownStyle {
  /**
   * The dropdown is rendered as a single button and, when expanded, takes the
   * full height of the window.
   */
  Foldout,

  /**
   * The dropdown is rendered as two buttons: one is the toolbar button itself,
   * and the other one is the expand/collapse button.
   * When expanded, it only takes the height of the content.
   */
  MultiOption,
}

export interface IToolbarDropdownProps {
  /** The style of the dropdown. Default: Foldout */
  readonly dropdownStyle?: ToolbarDropdownStyle

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

  /** The class name for the icon element. */
  readonly iconClassName?: string

  /** The button's style. Defaults to `ToolbarButtonStyle.Standard`. */
  readonly style?: ToolbarButtonStyle

  /** Whether the dropdown will trap focus or not. Defaults to true.
   *
   * Example of usage: If a dropdown is open and then a dialog subsequently, the
   * focus trap logic will stop propagation of the focus event to the dialog.
   * Thus, we want to disable this when dialogs are open since they will be
   * using the HTML build in dialog focus management.
   */
  readonly enableFocusTrap?: boolean

  /**
   * Sets the styles for the dropdown's foldout, replacing the defaults.
   * Useful for custom positioning and sizes.
   *
   * Note: If this property is set, the default positioning, size, and
   * `foldoutStyleOverrides` property are all ignored.
   */
  readonly foldoutStyle?: React.CSSProperties

  /**
   * Sets additional styles that add to or override the default foldout style.
   *
   * Use as an alternative to `foldoutStyle`, when only certain properties need
   * to be customized and the default style and placement should still apply.
   *
   * Note: If `foldoutStyle` is set, this property is ignored.
   */
  readonly foldoutStyleOverrides?: React.CSSProperties

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
  readonly buttonAriaHaspopup?: AriaHasPopupType

  /** Classes to be appended to `ToolbarButton` component */
  readonly buttonClassName?: string

  /**
   * Whether to only show the tooltip when the tooltip target overflows its
   * bounds. Typically this is used in conjunction with an ellipsis CSS ruleset.
   */
  readonly onlyShowTooltipWhenOverflowed?: boolean

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

  /**
   * Typically the contents of a button serve the purpose of describing the
   * buttons use. However, ariaLabel can be used if the contents do not suffice.
   * Such as when a button wraps an image and there is no text.
   */
  readonly ariaLabel?: string

  /** Whether or not the focus trap should return focus to the activating button  */
  readonly returnFocusOnDeactivate?: boolean

  /** Callback fro when the focus trap deactivates */
  readonly onDropdownFocusTrapDeactivate?: () => void
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
  private innerButton = React.createRef<ToolbarButton>()
  private rootDiv = React.createRef<HTMLDivElement>()
  private focusTrapOptions: FocusTrapOptions

  public constructor(props: IToolbarDropdownProps) {
    super(props)
    this.state = { clientRect: null }

    this.focusTrapOptions = {
      allowOutsideClick: true,

      // Explicitly disable deactivation from the FocusTrap, since in that case
      // we would lose the "source" of the event (keyboard vs pointer).
      clickOutsideDeactivates: false,
      escapeDeactivates: false,
      returnFocusOnDeactivate: this.props.returnFocusOnDeactivate,
      onDeactivate: this.props.onDropdownFocusTrapDeactivate,
    }
  }

  private get isOpen() {
    return this.props.dropdownState === 'open'
  }

  private dropdownIcon(state: DropdownState): OcticonSymbol {
    // @TODO: Remake triangle octicon in a 12px version,
    // right now it's scaled badly on normal dpi monitors.
    if (state === 'open') {
      return octicons.triangleUp
    } else if (state === 'closed') {
      return octicons.triangleDown
    } else {
      return assertNever(state, `Unknown dropdown state ${state}`)
    }
  }

  private renderDropdownArrow(): JSX.Element | null {
    if (this.props.showDisclosureArrow === false) {
      return null
    }

    const state = this.props.dropdownState
    const dropdownIcon = (
      <Octicon symbol={this.dropdownIcon(state)} className="dropdownArrow" />
    )

    return this.props.dropdownStyle === ToolbarDropdownStyle.MultiOption ? (
      <ToolbarButton
        className="toolbar-dropdown-arrow-button"
        onClick={this.onToggleDropdownClick}
        ariaExpanded={this.isOpen}
        ariaHaspopup={true}
        ariaLabel={this.props.ariaLabel}
      >
        {dropdownIcon}
      </ToolbarButton>
    ) : (
      dropdownIcon
    )
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

  private onMainButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.dropdownStyle === ToolbarDropdownStyle.MultiOption) {
      this.props.onClick?.(event)
      return
    }

    this.onToggleDropdownClick(event)
  }

  private onContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    this.props.onContextMenu?.(event)
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
      position: enableResizingToolbarButtons() ? 'fixed' : 'absolute',
      top: rect.bottom,
      left: 0,
      width: '100%',
      height: `calc(100% - ${rect.bottom}px)`,
    }
  }

  private getFoldoutStyle(): React.CSSProperties | undefined {
    // if `foldoutStyle` is set, ignore default style and `foldoutStyleOverrides`
    if (this.props.foldoutStyle) {
      return this.props.foldoutStyle
    }

    const rect = this.state.clientRect
    if (!rect) {
      return undefined
    }

    const heightStyle: React.CSSProperties =
      this.props.dropdownStyle === ToolbarDropdownStyle.MultiOption
        ? { maxHeight: '100%', width: rect.width }
        : { height: '100%', minWidth: rect.width }

    const overrides: React.CSSProperties =
      this.props.foldoutStyleOverrides ?? {}

    return {
      position: 'absolute',
      marginLeft: rect.left,
      top: 0,
      ...heightStyle,
      ...overrides,
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

  /**
   * Programmatically move keyboard focus to the button element.
   */
  public focusButton = () => {
    if (this.innerButton.current) {
      this.innerButton.current.focusButton()
    }
  }

  public render() {
    const className = classNames(
      'toolbar-dropdown',
      this.props.dropdownStyle === ToolbarDropdownStyle.MultiOption
        ? 'multi-option-style'
        : 'foldout-style',
      this.props.dropdownState,
      this.props.className
    )

    return (
      <div
        className={className}
        onKeyDown={this.props.onKeyDown}
        role={this.props.role}
        onDragOver={this.props.onDragOver}
        ref={this.rootDiv}
      >
        {this.renderDropdownContents()}
        <ToolbarButton
          className={this.props.buttonClassName}
          ref={this.innerButton}
          icon={this.props.icon}
          title={this.props.title}
          description={this.props.description}
          tooltip={this.props.tooltip}
          onClick={this.onMainButtonClick}
          onContextMenu={this.onContextMenu}
          onMouseEnter={this.props.onMouseEnter}
          style={this.props.style}
          iconClassName={this.props.iconClassName}
          disabled={this.props.disabled}
          tabIndex={this.props.tabIndex}
          progressValue={this.props.progressValue}
          role={this.props.buttonRole}
          onlyShowTooltipWhenOverflowed={
            this.props.onlyShowTooltipWhenOverflowed
          }
          isOverflowed={this.props.isOverflowed}
          ariaExpanded={
            this.props.dropdownStyle === ToolbarDropdownStyle.MultiOption
              ? undefined
              : this.isOpen
          }
          ariaHaspopup={this.props.buttonAriaHaspopup}
        >
          {this.props.children}
          {this.props.dropdownStyle !== ToolbarDropdownStyle.MultiOption &&
            this.renderDropdownArrow()}
        </ToolbarButton>
        {this.props.dropdownStyle === ToolbarDropdownStyle.MultiOption &&
          this.renderDropdownArrow()}
      </div>
    )
  }
}
