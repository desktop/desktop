import * as React from 'react'
import {
  DropdownSelectButton,
  IDropdownSelectButtonOption,
} from '../dropdown-select-button'
import { MenuIDs } from '../../models/menu-ids'
import { executeMenuItemById } from '../main-process-proxy'
import { sendNonFatalException } from '../../lib/helpers/non-fatal-exception'
import classNames from 'classnames'

export interface IDropdownSuggestedActionOption
  extends IDropdownSelectButtonOption {
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

export interface IDropdownSuggestedActionProps {
  /** The possible suggested next actions to select from
   *
   * This component assumes this is not an empty array.
   */
  readonly suggestedActions: ReadonlyArray<IDropdownSuggestedActionOption>

  /** The value of the selected next action to initialize the component with */
  readonly selectedActionValue?: string

  readonly onSuggestedActionChanged: (action: string) => void

  /**
   * An optional additional class name to set in order to be able to apply
   * specific styles to the dropdown suggested next action
   */
  readonly className?: string
}

interface IDropdownSuggestedActionState {
  readonly selectedActionValue: string
}

export class DropdownSuggestedAction extends React.Component<
  IDropdownSuggestedActionProps,
  IDropdownSuggestedActionState
> {
  private get selectedAction() {
    const selectedAction = this.props.suggestedActions.find(
      a => a.id === this.state.selectedActionValue
    )
    if (selectedAction === undefined) {
      // Shouldn't happen .. but if it did we don't want to crash app, but we want to tell dev what is up
      sendNonFatalException(
        'NoSuggestedActionsProvided',
        new Error(
          'The DropdownSuggestedActions component was provided an empty array. It requires an array of at least one item.'
        )
      )
    }
    return selectedAction
  }

  public constructor(props: IDropdownSuggestedActionProps) {
    super(props)

    const { selectedActionValue, suggestedActions } = props
    const firstActionValue = suggestedActions[0].id

    this.state = {
      selectedActionValue: selectedActionValue ?? firstActionValue,
    }
  }

  private onActionSelectionChange = (option: IDropdownSelectButtonOption) => {
    this.setState({ selectedActionValue: option.id })
    this.props.onSuggestedActionChanged(option.id)
  }

  private onActionSubmitted = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (this.selectedAction === undefined) {
      // Just a type check
      return
    }

    const { onClick, menuItemId } = this.selectedAction
    onClick?.(e)

    if (!e.defaultPrevented && menuItemId !== undefined) {
      executeMenuItemById(menuItemId)
    }
  }

  public render() {
    if (this.selectedAction === undefined) {
      // Just a type check
      return
    }

    const { description, image, discoverabilityContent, disabled, id, title } =
      this.selectedAction

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
        <DropdownSelectButton
          checkedOption={id}
          options={this.props.suggestedActions.map(({ label, id }) => ({
            label,
            id,
          }))}
          disabled={disabled}
          dropdownAriaLabel="Suggested actions for this branch"
          onCheckedOptionChange={this.onActionSelectionChange}
          onSubmit={this.onActionSubmitted}
        />
      </div>
    )
  }
}
