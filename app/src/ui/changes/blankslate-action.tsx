import * as React from 'react'
import * as classNames from 'classnames'
import { Button } from '../lib/button'

interface IBlankSlateActionProps {
  readonly title: string
  readonly description?: string | JSX.Element
  readonly discoverabilityContent: string | JSX.Element
  readonly buttonText: string | JSX.Element
  readonly onClick: () => void
  readonly className?: string
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
    const cn = classNames('blankslate-action', this.props.className)
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
        <Button onClick={this.props.onClick}>{this.props.buttonText}</Button>
      </div>
    )
  }
}
