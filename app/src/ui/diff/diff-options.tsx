import * as React from 'react'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { RadioButton } from '../lib/radio-button'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { Tooltip, TooltipDirection } from '../lib/tooltip'
import { createObservableRef } from '../lib/observable-ref'
import { DiffViewMode } from '../lib/diff-mode'

interface IDiffOptionsProps {
  readonly isInteractiveDiff: boolean
  readonly hideWhitespaceChanges: boolean
  readonly onHideWhitespaceChangesChanged: (
    hideWhitespaceChanges: boolean
  ) => void

  readonly diffViewMode: DiffViewMode
  readonly onDiffViewModeChanged: (mode: DiffViewMode) => void

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
  private innerButtonRef = createObservableRef<HTMLButtonElement>()
  private diffOptionsRef = React.createRef<HTMLDivElement>()
  private gearIconRef = React.createRef<HTMLSpanElement>()

  public constructor(props: IDiffOptionsProps) {
    super(props)
    this.state = {
      isPopoverOpen: false,
    }
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

  public render() {
    const buttonLabel = `Diff ${__DARWIN__ ? 'Settings' : 'Options'}`
    return (
      <div className="diff-options-component" ref={this.diffOptionsRef}>
        <button
          aria-label={buttonLabel}
          onClick={this.onButtonClick}
          aria-expanded={this.state.isPopoverOpen}
          ref={this.innerButtonRef}
        >
          <Tooltip
            target={this.innerButtonRef}
            direction={TooltipDirection.NORTH}
            applyAriaDescribedBy={false}
          >
            {buttonLabel}
          </Tooltip>
          <span ref={this.gearIconRef}>
            <Octicon symbol={octicons.gear} />
          </span>
          <Octicon symbol={octicons.triangleDown} />
        </button>
        {this.state.isPopoverOpen && this.renderPopover()}
      </div>
    )
  }

  private renderPopover() {
    const header = `Diff ${__DARWIN__ ? 'Settings' : 'Options'}`
    return (
      <Popover
        ariaLabelledby="diff-options-popover-header"
        anchor={this.gearIconRef.current}
        anchorPosition={PopoverAnchorPosition.BottomRight}
        decoration={PopoverDecoration.Balloon}
        onMousedownOutside={this.closePopover}
        onClickOutside={this.closePopover}
      >
        <h3 id="diff-options-popover-header">{header}</h3>
        {this.renderHideWhitespaceChanges()}
        {this.renderDiffMode()}
      </Popover>
    )
  }

  private onUnifiedSelected = () => {
    this.props.onDiffViewModeChanged(DiffViewMode.Unified)
  }
  private onSideBySideSelected = () => {
    this.props.onDiffViewModeChanged(DiffViewMode.Split)
  }
  private onMixedSelected = () => {
    this.props.onDiffViewModeChanged(DiffViewMode.Mixed)
  }

  private renderDiffMode() {
    return (
      <fieldset role="radiogroup">
        <legend>Diff display</legend>
        <RadioButton
          value="Unified"
          checked={this.props.diffViewMode === DiffViewMode.Unified}
          label="Unified"
          onSelected={this.onUnifiedSelected}
        />
        <RadioButton
          value="Split"
          checked={this.props.diffViewMode === DiffViewMode.Split}
          label={
            <>
              <div>Split</div>
            </>
          }
          onSelected={this.onSideBySideSelected}
        />
        <RadioButton
          value="Mixed"
          checked={this.props.diffViewMode === DiffViewMode.Mixed}
          label={
            <>
              <div>Mixed</div>
            </>
          }
          onSelected={this.onMixedSelected}
        />
        <p className="secondary-text">
          Mixed mode uses Unified for added and deleted files,
          and Split view for modified and moved files.
        </p>
      </fieldset>
    )
  }

  private renderHideWhitespaceChanges() {
    return (
      <fieldset>
        <legend>Whitespace</legend>
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
        {this.props.isInteractiveDiff && (
          <p className="secondary-text">
            Interacting with individual lines or hunks will be disabled while
            hiding whitespace.
          </p>
        )}
      </fieldset>
    )
  }
}
