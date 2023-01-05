import * as React from 'react'
import {
  DropdownSelectButton,
  IDropdownSelectButtonOption,
} from '../dropdown-select-button'
import { MenuIDs } from '../../models/menu-ids'
import { executeMenuItemById } from '../main-process-proxy'
import { sendNonFatalException } from '../../lib/helpers/non-fatal-exception'
import classNames from 'classnames'

export interface IDropdownSuggestedActionOption<T extends string>
  extends IDropdownSelectButtonOption<T> {
  /**
   * The title, or "header" text for a suggested
   * action.
   */
  readonly title?: string

  /**
   * A text or set of elements used to present information
   * to the user about how and where to access the action
   * outside of the suggested action.
   */
  readonly discoverabilityContent?: string | JSX.Element

  /**
   * A callback which is invoked when the user clicks
   * or activates the action using their keyboard.
   */
  readonly onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void

  /**
   * Whether or not the action should be disabled. Disabling
   * the action means that the button will no longer be
   * clickable.
   */
  readonly disabled?: boolean

  /**
   * An image to illustrate what this component's action does
   */
  readonly image?: JSX.Element

  /**
   * The id of the menu item backing this action.
   * When the action is invoked the menu item specified
   * by this id will be executed.
   */
  readonly menuItemId?: MenuIDs
}

export interface IDropdownSuggestedActionProps<T extends string> {
  /** The possible suggested next actions to select from
   *
   * This component assumes this is not an empty array.
   */
  readonly suggestedActions: ReadonlyArray<IDropdownSuggestedActionOption<T>>

  /** The value of the selected next action to initialize the component with */
  readonly selectedActionValue?: T

  readonly onSuggestedActionChanged: (action: T) => void

  /**
   * An optional additional class name to set in order to be able to apply
   * specific styles to the dropdown suggested next action
   */
  readonly className?: string
}

interface IDropdownSuggestedActionState<T extends string> {
  readonly selectedAction: IDropdownSuggestedActionOption<T>
}

export class DropdownSuggestedAction<T extends string> extends React.Component<
  IDropdownSuggestedActionProps<T>,
  IDropdownSuggestedActionState<T>
> {
  public constructor(props: IDropdownSuggestedActionProps<T>) {
    super(props)

    const { selectedActionValue, suggestedActions } = props
    const firstAction = suggestedActions[0]
    const selectedAction =
      selectedActionValue !== undefined
        ? suggestedActions.find(
            a => a.value === this.props.selectedActionValue
          ) ?? firstAction
        : firstAction
    this.state = {
      selectedAction,
    }
  }

  private onActionSelectionChange = (
    option: IDropdownSelectButtonOption<T>
  ) => {
    const selectedAction = this.props.suggestedActions.find(
      a => a.value === option.value
    )

    if (selectedAction === undefined) {
      return
    }

    this.setState({ selectedAction })
    this.props.onSuggestedActionChanged(selectedAction.value)
  }

  private onActionSubmitted = (e: React.MouseEvent<HTMLButtonElement>) => {
    const { onClick, menuItemId } = this.state.selectedAction
    onClick?.(e)

    if (!e.defaultPrevented && menuItemId !== undefined) {
      executeMenuItemById(menuItemId)
    }
  }

  public render() {
    const { selectedAction } = this.state
    if (selectedAction === undefined) {
      // Shouldn't happen .. but if it did we don't want to crash app and tell dev what is up
      sendNonFatalException(
        'NoSuggestedActionsProvided',
        new Error(
          'The DropdownSuggestedActions component was provided an empty array. It requires an array of at least one item.'
        )
      )
      return null
    }

    const {
      description,
      image,
      discoverabilityContent,
      disabled,
      value,
      title,
    } = selectedAction

    const className = classNames(
      'suggested-action',
      'primary',
      this.props.className
    )

    return (
      <div className={className}>
        {image && <div className="image-wrapper">{image}</div>}
        <div className="text-wrapper">
          <h2>{title}</h2>
          {description && <p className="description">{description}</p>}
          {discoverabilityContent && (
            <p className="discoverability">{discoverabilityContent}</p>
          )}
        </div>
        <DropdownSelectButton<T>
          selectedValue={value}
          options={this.props.suggestedActions.map(({ label, value }) => ({
            label,
            value,
          }))}
          disabled={disabled}
          onSelectChange={this.onActionSelectionChange}
          onSubmit={this.onActionSubmitted}
        />
      </div>
    )
  }
}
