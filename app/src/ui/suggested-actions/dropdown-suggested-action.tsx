import * as React from 'react'
import {
  DropdownSelectButton,
  IDropdownSelectButtonOption,
} from '../dropdown-select-button'
import { MenuIDs } from '../../models/menu-ids'
import { executeMenuItemById } from '../main-process-proxy'

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
  readonly suggestedActions: ReadonlyArray<IDropdownSuggestedActionOption>
}

interface IDropdownSuggestedActionState {
  readonly selectedAction: IDropdownSuggestedActionOption
}

export class DropdownSuggestedAction extends React.Component<
  IDropdownSuggestedActionProps,
  IDropdownSuggestedActionState
> {
  public constructor(props: IDropdownSuggestedActionProps) {
    super(props)

    this.state = {
      selectedAction: this.props.suggestedActions[0],
    }
  }

  private onActionSelectionChange = (option: IDropdownSelectButtonOption) => {
    const selectedAction = this.props.suggestedActions.find(
      a => a.value === option.value
    )
    if (selectedAction === undefined) {
      return
    }

    this.setState({ selectedAction })
  }

  private onActionSubmitted = (e: React.MouseEvent<HTMLButtonElement>) => {
    const { onClick, menuItemId } = this.state.selectedAction
    onClick?.(e)

    if (!e.defaultPrevented && menuItemId !== undefined) {
      executeMenuItemById(menuItemId)
    }
  }

  public render() {
    const {
      description,
      image,
      discoverabilityContent,
      disabled,
      value,
      title,
    } = this.state.selectedAction

    return (
      <div className="suggested-action primary">
        {image && <div className="image-wrapper">{image}</div>}
        <div className="text-wrapper">
          <h2>{title}</h2>
          {description && <p className="description">{description}</p>}
          {discoverabilityContent && (
            <p className="discoverability">{discoverabilityContent}</p>
          )}
        </div>
        <DropdownSelectButton
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
