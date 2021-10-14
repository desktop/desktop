import * as React from 'react'
import { IIssue } from '../../lib/databases'
import { getIssueSubtitle } from '../branches/issues-list'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  OkCancelButtonGroup,
} from '../dialog'
import { SandboxedMarkdown } from '../lib/sandboxed-markdown'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'

interface IIssueProps {
  readonly onDismissed: () => void
  readonly onStartWorkingIssue: () => void
  readonly issue: IIssue
}

export class Issue extends React.Component<IIssueProps, {}> {
  private renderIssueDialogHeader = (): JSX.Element => {
    return (
      <div className="issue-header">
        <h2 className="issue-title">
          {this.props.issue.title} <span> #{this.props.issue.number}</span>
        </h2>
        <div className="issue-subtitle">
          <div className="issue-open-bubble">
            <Octicon className="icon" symbol={OcticonSymbol.issueOpened} />
            Open
          </div>
          {getIssueSubtitle(this.props.issue)}
        </div>
      </div>
    )
  }

  public render() {
    // Hardcoded.. but could pass this down..
    const markdownBaseHref = 'https://github.com/'

    return (
      <Dialog
        id="issue"
        onDismissed={this.props.onDismissed}
        title={this.renderIssueDialogHeader()}
      >
        <DialogContent>
          <div className="container">
            <div className="issue-body">
              <SandboxedMarkdown
                markdown={this.props.issue.body}
                baseHref={markdownBaseHref}
              />
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            onCancelButtonClick={this.props.onDismissed}
            onOkButtonClick={this.props.onStartWorkingIssue}
            okButtonText="Start Working"
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
