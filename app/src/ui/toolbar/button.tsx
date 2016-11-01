import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'

interface IToolbarButtonProps {
  title: string,
  description?: string,
  icon?: OcticonSymbol
}

/**
 * A general purpose toolbar button
 */
export class ToolbarButton extends React.Component<IToolbarButtonProps, void> {
  public render() {
    const icon = this.props.icon
      ? <Octicon symbol={this.props.icon} />
      : null

    const description = this.props.description
      ? <div className='description'>{this.props.description}</div>
      : null

    return (
      <button className='toolbar-button'>
        {icon}
        <div className='text'>
          <div className='title'>{this.props.title}</div>
          {description}
        </div>
        {this.props.children}
      </button>
    )
  }
}
