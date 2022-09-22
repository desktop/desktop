import * as React from 'react'
import classNames from 'classnames'
import { Button } from '../lib/button'

interface ISuggestedActionProps {
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
  readonly buttonText: string | JSX.Element

  /**
   * A callback which is invoked when the user clicks
   * or activates the action using their keyboard.
   */
  readonly onClick: (e: React.MouseEvent<HTMLButtonElement>) => void

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

  /**
   * An image to illustrate what this component's action does
   */
  readonly image?: JSX.Element
}

/**
 * A small container component for rendering a "suggested action",
 * which was first used in the "No Changes" view. An action is
 * usually contained within an `SuggestedActionGroup`, which visually
 * connects one or more actions. An action component has a title,
 * a description, a button label, and an optional image.
 */
export class SuggestedAction extends React.Component<ISuggestedActionProps> {
  public render() {
    const primary = this.props.type === 'primary'
    const cn = classNames('suggested-action', { primary })
    const description =
      this.props.description === undefined ? undefined : (
        <p className="description">{this.props.description}</p>
      )
    return (
      <div className={cn}>
        {this.props.image && (
          <div className="image-wrapper">{this.props.image}</div>
        )}
        <div className="text-wrapper">
          <h2>{this.props.title}</h2>
          {description}
          {this.props.discoverabilityContent && (
            <p className="discoverability">
              {this.props.discoverabilityContent}
            </p>
          )}
        </div>
        <Button
          type={primary ? 'submit' : undefined}
          onClick={this.props.onClick}
          disabled={this.props.disabled}
        >
          {this.props.buttonText}
        </Button>
      </div>
    )
  }
}
