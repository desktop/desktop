import * as React from 'react'
import { BlankslateAction } from './blankslate-action'
import { MenuIDs } from '../../main-process/menu'
import { executeMenuItemById } from '../main-process-proxy'

interface IMenuBackedBlankSlateActionProps {
  readonly title: string
  readonly description?: string | JSX.Element
  readonly discoverabilityContent: string | JSX.Element
  readonly buttonText: string | JSX.Element
  readonly menuItemId: MenuIDs
  readonly type?: 'normal' | 'primary'
  readonly disabled?: boolean
}

/**
 * A small container component for rendering an "action" in a blank
 * slate view. An action is usally contained within an action group
 * which visually connects one or more actions. An action component
 * has a title, a description, and a button label.
 */
export class MenuBackedBlankslateAction extends React.Component<
  IMenuBackedBlankSlateActionProps,
  {}
> {
  public render() {
    return (
      <BlankslateAction
        title={this.props.title}
        description={this.props.description}
        discoverabilityContent={this.props.discoverabilityContent}
        buttonText={this.props.buttonText}
        onClick={this.onClick}
        type={this.props.type}
        disabled={this.props.disabled}
      />
    )
  }

  private onClick = () => {
    executeMenuItemById(this.props.menuItemId)
  }
}
