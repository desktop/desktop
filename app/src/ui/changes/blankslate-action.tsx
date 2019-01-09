import * as React from 'react'
import * as classNames from 'classnames'
import { Button } from '../lib/button'

interface IBlankSlateActionProps {
  /**
   * The title, or "header" text for a blank slate
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
   * outside of the blank slate action.
   */
  readonly discoverabilityContent: string | JSX.Element

  /**
   * The text, or "label", for the action button.
   */
  readonly buttonText: string | JSX.Element

  /**
   * A callback which is invoked when the user clicks
   * or activates the action using their keyboard.
   */
  readonly onClick: () => void

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

/**
 * A small container component for rendering an "action" in a blank
 * slate view. An action is usally contained within an action group
 * which visually connects one or more actions. An action component
 * has a title, a description, and a button label.
 */
export class BlankslateAction extends React.Component<
  IBlankSlateActionProps,
  {}
> {
  public render() {
    const primary = this.props.type === 'primary'
    const cn = classNames('blankslate-action', { primary })
    const description =
      this.props.description === undefined ? (
        undefined
      ) : (
        <p className="description">{this.props.description}</p>
      )
    return (
      <div className={cn}>
        <div className="text-wrapper">
          <h2>{this.props.title}</h2>
          {description}
          <p className="discoverability">{this.props.discoverabilityContent}</p>
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
