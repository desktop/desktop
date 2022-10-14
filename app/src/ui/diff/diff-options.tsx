import * as React from 'react'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { RadioButton } from '../lib/radio-button'
import { Popover, PopoverCaretPosition } from '../lib/popover'
import { getPlatformSpecificNameOrSymbolForModifier } from '../../lib/menu-item'

interface IDiffOptionsProps {
  readonly isInteractiveDiff: boolean
  readonly hideWhitespaceChanges: boolean
  readonly onHideWhitespaceChangesChanged: (
    hideWhitespaceChanges: boolean
  ) => void

  readonly showSideBySideDiff: boolean
  readonly onShowSideBySideDiffChanged: (showSideBySideDiff: boolean) => void

  /** Called when the user opens the diff options popover */
  readonly onDiffOptionsOpened: () => void
}

interface IDiffOptionsState {
  readonly isPopoverOpen: boolean
}

export class DiffOptions extends React.Component<
  IDiffOptionsProps,
  IDiffOptionsState
> {
  readonly toggleHideWhitespaceChangesKey = 'D';
  readonly toggleDiffDisplayModeKey = 'D';

  private diffOptionsRef = React.createRef<HTMLDivElement>()

  public constructor(props: IDiffOptionsProps) {
    super(props)
    this.state = {
      isPopoverOpen: false,
    }
  }

  public componentDidMount() {
    document.addEventListener('keydown', this.onWindowKeyDown)
  }

  public componentWillUnmount() {
    document.removeEventListener('keydown', this.onWindowKeyDown)
  }

  private onButtonClick = (event: React.FormEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (this.state.isPopoverOpen) {
      this.closePopover()
    } else {
      this.openPopover()
    }
  }

  private openPopover = () => {
    this.setState(prevState => {
      if (!prevState.isPopoverOpen) {
        this.props.onDiffOptionsOpened()
        return { isPopoverOpen: true }
      }
      return null
    })
  }

  private closePopover = () => {
    this.setState(prevState => {
      if (prevState.isPopoverOpen) {
        return { isPopoverOpen: false }
      }

      return null
    })
  }

  private onHideWhitespaceChangesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    return this.props.onHideWhitespaceChangesChanged(
      event.currentTarget.checked
    )
  }

  private onWindowKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }
    const isCmdOrCtrl = __DARWIN__
      ? event.metaKey && !event.ctrlKey
      : event.ctrlKey
    const key = String.fromCharCode(event.keyCode).toUpperCase()

    if (isCmdOrCtrl && !event.shiftKey && event.altKey && key === this.toggleHideWhitespaceChangesKey) {
      event.preventDefault()
      this.toggleHideWhitespaceChanges()
    }
    else if (isCmdOrCtrl && !event.shiftKey && !event.altKey && key === this.toggleDiffDisplayModeKey) {
      event.preventDefault()
      this.toggleDiffDisplayMode()
    }
  }

  private toggleHideWhitespaceChanges = () => {
    this.props.onHideWhitespaceChangesChanged(!this.props.hideWhitespaceChanges)
  }

  private toggleDiffDisplayMode = () => {
    this.props.onShowSideBySideDiffChanged(!this.props.showSideBySideDiff)
  }

  public render() {
    return (
      <div className="diff-options-component" ref={this.diffOptionsRef}>
        <button onClick={this.onButtonClick}>
          <Octicon symbol={OcticonSymbol.gear} />
          <Octicon symbol={OcticonSymbol.triangleDown} />
        </button>
        {this.state.isPopoverOpen && this.renderPopover()}
      </div>
    )
  }

  private renderPopover() {
    return (
      <Popover
        caretPosition={PopoverCaretPosition.TopRight}
        onClickOutside={this.closePopover}
      >
        {this.renderHideWhitespaceChanges()}
        {this.renderShowSideBySide()}
      </Popover>
    )
  }

  private onUnifiedSelected = () => {
    this.props.onShowSideBySideDiffChanged(false)
  }
  private onSideBySideSelected = () => {
    this.props.onShowSideBySideDiffChanged(true)
  }

  private renderShowSideBySide() {
    return (
      <section>
        <h3>Diff display</h3>
        <RadioButton
          value="Unified"
          checked={!this.props.showSideBySideDiff}
          label="Unified"
          onSelected={this.onUnifiedSelected}
        />
        <RadioButton
          value="Split"
          checked={this.props.showSideBySideDiff}
          label={
            <>
              <div>Split</div>
            </>
          }
          onSelected={this.onSideBySideSelected}
        />
        <p className="secondary-text">
          Toggle with {this.renderKeyboardShortcut("CmdOrCtrl+" + this.toggleDiffDisplayModeKey)}
        </p>
      </section>
    )
  }

  private renderHideWhitespaceChanges() {
    return (
      <section>
        <h3>Whitespace</h3>
        <Checkbox
          value={
            this.props.hideWhitespaceChanges
              ? CheckboxValue.On
              : CheckboxValue.Off
          }
          onChange={this.onHideWhitespaceChangesChanged}
          label={
            __DARWIN__ ? 'Hide Whitespace Changes' : 'Hide whitespace changes'
          }
        />
        <p className="secondary-text">
          Toggle with {this.renderKeyboardShortcut("Alt+CmdOrCtrl+" + this.toggleHideWhitespaceChangesKey)}
        </p>
        {this.props.isInteractiveDiff && (
          <p className="secondary-text">
            Interacting with individual lines or hunks will be disabled while
            hiding whitespace.
          </p>
        )}
      </section>
    )
  }


  private renderKeyboardShortcut(shortcut: string) {
    return shortcut.split('+').map(getPlatformSpecificNameOrSymbolForModifier).map((k, i) => <kbd key={k + i}>{k}</kbd>)
  }
}
