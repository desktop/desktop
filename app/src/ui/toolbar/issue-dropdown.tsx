import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { syncClockwise } from '../octicons'
import { RepositoryWithGitHubRepository } from '../../models/repository'
import { ToolbarDropdown, DropdownState } from './dropdown'
import { IIssue } from '../../lib/databases'
import { IssueList } from '../branches/issues-list'
import { FoldoutType } from '../../lib/app-state'

interface IIssueDropdownProps {
  readonly dispatcher: Dispatcher
  readonly repository: RepositoryWithGitHubRepository

  /** The open issues in the repository. */
  readonly openIssues: ReadonlyArray<IIssue>

  /** Are we currently loading issues */
  readonly isLoadingIssues: boolean

  /** Whether or not the issue dropdown is currently open */
  readonly isOpen: boolean

  /**
   * An event handler for when the drop down is opened, or closed, by a pointer
   * event or by pressing the space or enter key while focused.
   *
   * @param state    - The new state of the drop down
   */
  readonly onDropDownStateChanged: (state: DropdownState) => void
}

/**
 * A drop down for viewing issues
 */
export class IssueDropdown extends React.Component<IIssueDropdownProps> {
  private renderIssuesFoldout = (): JSX.Element | null => {
    const { repository, dispatcher, openIssues, isLoadingIssues } = this.props
    return (
      <IssueList
        key="issue-list"
        onDismiss={this.onDismiss}
        dispatcher={dispatcher}
        repository={repository}
        openIssues={openIssues}
        isLoadingIssues={isLoadingIssues}
      />
    )
  }

  private onDismiss = () => {
    this.props.dispatcher.closeFoldout(FoldoutType.Issue)
  }

  public render() {
    const {
      openIssues,
      isLoadingIssues,
      isOpen,
      onDropDownStateChanged,
    } = this.props

    const count = openIssues.length
    const icon = isLoadingIssues ? syncClockwise : OcticonSymbol.issueOpened
    const iconClassName = isLoadingIssues ? 'spin' : undefined
    const title = __DARWIN__ ? 'Open Issues' : 'Open issues'
    const description = `${count} open issue${count > 0 ? 's' : ''}`
    const tooltip = description
    const dropdownState = isOpen ? 'open' : 'closed'

    return (
      <ToolbarDropdown
        className="issue-button"
        icon={icon}
        iconClassName={iconClassName}
        title={title}
        description={description}
        tooltip={tooltip}
        onDropdownStateChanged={onDropDownStateChanged}
        dropdownContentRenderer={this.renderIssuesFoldout}
        dropdownState={dropdownState}
      ></ToolbarDropdown>
    )
  }
}
