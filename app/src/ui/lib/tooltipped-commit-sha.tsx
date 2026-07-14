import { clipboard } from 'electron'
import React from 'react'
import { Commit, shortenSHA } from '../../models/commit'
import { Ref } from './ref'
import { TooltipDirection } from './tooltip'
import { TooltippedContent } from './tooltipped-content'

interface ITooltippedCommitSHAProps {
  readonly className?: string
  /** Commit or long SHA of a commit to render in the component. */
  readonly commit: string | Commit

  /** Whether or not render the commit as a Ref component. Default: false */
  readonly asRef?: boolean
}

export class TooltippedCommitSHA extends React.Component<
  ITooltippedCommitSHAProps,
  {}
> {
  private get shortSHA() {
    const { commit } = this.props
    return typeof commit === 'string' ? shortenSHA(commit) : commit.shortSha
  }

  private get longSHA() {
    const { commit } = this.props
    return typeof commit === 'string' ? commit : commit.sha
  }

  public render() {
    const { className } = this.props

    return (
      <TooltippedContent
        className={className}
        tooltip={this.renderSHATooltip()}
        tooltipClassName="sha-hint"
        interactive={true}
        direction={TooltipDirection.SOUTH}
      >
        {this.renderShortSHA()}
      </TooltippedContent>
    )
  }

  private renderShortSHA() {
    return this.props.asRef === true ? (
      <Ref>{this.shortSHA}</Ref>
    ) : (
      this.shortSHA
    )
  }

  private renderSHATooltip() {
    return (
      <>
        <code>{this.longSHA}</code>
        <button onClick={this.onCopySHAButtonClick}>Copy</button>
      </>
    )
  }

  private onCopySHAButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    clipboard.writeText(this.longSHA)
  }
}
