import * as React from 'react'
import {
  DropdownSelectButton,
  IDropdownSelectButtonOption,
} from '../dropdown-select-button'
import { MenuIDs } from '../../models/menu-ids'
import { executeMenuItemById } from '../main-process-proxy'

export interface ISuggestedMultiActionOption
  extends IDropdownSelectButtonOption {
  /** Title for action */
  readonly title: string

  /** The select option header label. */
  readonly label: string | JSX.Element

  /**
   * Whether or not the action should be disabled. Disabling
   * the action means that the button will no longer be
   * clickable.
   */
  readonly disabled?: boolean

  readonly menuItemId?: MenuIDs

  readonly discoverabilityContent?: string | JSX.Element
}

interface ISuggestedMultiActionProps {
  readonly options: ReadonlyArray<ISuggestedMultiActionOption>
  readonly onClick: (
    option: ISuggestedMultiActionOption,
    e?: React.MouseEvent<HTMLButtonElement>
  ) => void
}

interface ISuggestedMultiActionState {
  readonly selectedOption: ISuggestedMultiActionOption
}

export class SuggestedMultiAction extends React.Component<
  ISuggestedMultiActionProps,
  ISuggestedMultiActionState
> {
  public constructor(props: ISuggestedMultiActionProps) {
    super(props)

    this.state = { selectedOption: props.options[0] }
  }

  private onActionChange = (option: IDropdownSelectButtonOption) => {
    const selectedOption = this.props.options.find(
      o => o.value === option.value
    )
    if (selectedOption !== undefined) {
      this.setState({ selectedOption })
    }
  }

  private onActionSubmitted = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.onClick !== undefined) {
      this.props.onClick(this.state.selectedOption, e)
    }

    if (
      !e.defaultPrevented &&
      this.state.selectedOption.menuItemId !== undefined
    ) {
      executeMenuItemById(this.state.selectedOption.menuItemId)
    }
  }

  public render() {
    const { description, title, disabled, value, discoverabilityContent } =
      this.state.selectedOption

    const descriptionElement =
      description === undefined ? undefined : (
        <p className="description">{description}</p>
      )

    const discoverabilityContentElement =
      discoverabilityContent !== undefined ? (
        <p className="discoverability">{discoverabilityContent}</p>
      ) : undefined

    return (
      <div className="suggested-action primary">
        <div className="text-wrapper">
          <h2>{title}</h2>
          {descriptionElement}
          {discoverabilityContentElement}
        </div>

        <DropdownSelectButton
          selectedValue={value}
          options={this.props.options}
          disabled={disabled}
          onSelectChange={this.onActionChange}
          onSubmit={this.onActionSubmitted}
          hideDescriptions={true}
        />
      </div>
    )
  }
}
