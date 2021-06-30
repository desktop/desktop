import * as React from 'react'
import classNames from 'classnames'
import { Button } from '../lib/button'
import {
  DropdownSelectButton,
  IDropdownSelectButtonOption,
} from '../dropdown-select-button'

interface ISuggestedAction {
  /**
   * The title, or "header" text for a suggested
   * action.
   */
  readonly title: string

  /**
   * An optional description to be rendered directly
   * underneath the title.
   */
  readonly description?: string | JSX.Element

  /**
   * A text or set of elements used to present information
   * to the user about how and where to access the action
   * outside of the suggested action.
   */
  readonly discoverabilityContent?: string | JSX.Element

  /**
   * The text, or "label", for the action button.
   */
  readonly buttonText: string

  /**
   * A callback which is invoked when the user clicks
   * or activates the action using their keyboard.
   */
  readonly onClick: (e: React.MouseEvent<HTMLButtonElement>) => void

  /**
   * An image to illustrate what this component's action does
   */
  readonly image?: JSX.Element
}

interface ISuggestedActionProps {
  readonly actions: ReadonlyArray<ISuggestedAction>

  /**
   * The type of action, currently supported actions are
   * normal, and primary. Primary actions are visually
   * distinct from normal actions in order to stand out
   * as a highly probable next step action.
   */
  readonly type?: 'normal' | 'primary'

  /**
   * Whether or not the action should be disabled. Disabling
   * the action means that the button will no longer be
   * clickable.
   */
  readonly disabled?: boolean
}

interface ISuggestedActionState {
  readonly selectedAction: string | undefined
}

/**
 * A small container component for rendering a "suggested action",
 * which was first used in the "No Changes" view. An action is
 * usually contained within an `SuggestedActionGroup`, which visually
 * connects one or more actions. An action component has a title,
 * a description, a button label, and an optional image.
 */
export class SuggestedAction extends React.Component<
  ISuggestedActionProps,
  ISuggestedActionState
> {
  public constructor(props: ISuggestedActionProps) {
    super(props)
    this.state = {
      selectedAction: props.actions[0].buttonText,
    }
  }

  public render() {
    const primary = this.props.type === 'primary'
    const cn = classNames('suggested-action', { primary })
    const action = this.selectedAction

    const description =
      action.description === undefined ? undefined : (
        <p className="description">{action.description}</p>
      )
    return (
      <div className={cn}>
        {action.image && <div className="image-wrapper">{action.image}</div>}
        <div className="text-wrapper">
          <h2>{action.title}</h2>
          {description}
          {action.discoverabilityContent && (
            <p className="discoverability">{action.discoverabilityContent}</p>
          )}
        </div>

        {this.renderSubmitButton()}
      </div>
    )
  }

  private get selectedAction(): ISuggestedAction {
    return (
      this.props.actions.find(
        a => a.buttonText === this.state.selectedAction
      ) ?? this.props.actions[0]
    )
  }

  private renderSubmitButton() {
    if (this.props.actions.length === 1) {
      const action = this.props.actions[0]

      return (
        <Button
          type={this.props.type === 'primary' ? 'submit' : undefined}
          onClick={action.onClick}
          disabled={this.props.disabled}
        >
          {action.buttonText}
        </Button>
      )
    }

    return (
      <DropdownSelectButton
        selectedValue={this.selectedAction.buttonText}
        type={this.props.type}
        options={this.props.actions.map(a => {
          return {
            label: a.buttonText,
            value: a.buttonText,
          }
        })}
        disabled={this.props.disabled}
        onSelectChange={this.onOperationChange}
        onSubmit={this.onOperationInvoked}
      />
    )
  }

  private onOperationChange = (selectedOption: IDropdownSelectButtonOption) => {
    this.setState({ selectedAction: selectedOption.value })
  }

  private onOperationInvoked = (
    event: React.MouseEvent<HTMLButtonElement>,
    selectedOption: IDropdownSelectButtonOption
  ) => {
    const action = this.props.actions.find(
      a => a.buttonText === selectedOption.value
    )

    if (action !== undefined) {
      action.onClick(event)
    }
  }
}
