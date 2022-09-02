import { clipboard } from 'electron'
import React from 'react'
import { TooltipDirection } from './tooltip'
import { TooltippedContent } from './tooltipped-content'

interface ITooltippedCommitSHAProps {
  readonly className?: string
  /**
   * Short SHA to display in the tooltipped element, or the tooltipped element
   * itself.
   */
  readonly shortSHA: string | JSX.Element

  /** Long SHA to display within the tooltip. */
  readonly longSHA: string
}

export class TooltippedCommitSHA extends React.Component<
  ITooltippedCommitSHAProps,
  {}
> {
  public render() {
    const { className, shortSHA } = this.props

    return (
      <TooltippedContent
        className={className}
        tooltip={this.renderShaTooltip()}
        tooltipClassName="sha-hint"
        interactive={true}
        direction={TooltipDirection.SOUTH}
      >
        {shortSHA}
      </TooltippedContent>
    )
  }

  private renderShaTooltip() {
    return (
      <>
        <code>{this.props.longSHA}</code>
        <button onClick={this.onCopyShaButtonClick}>Copy</button>
      </>
    )
  }

  private onCopyShaButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    clipboard.writeText(this.props.longSHA)
  }
}
