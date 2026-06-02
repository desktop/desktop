import * as React from 'react'

import { shell } from '../../lib/app-shell'
import { FoldoutType } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import * as octicons from '../octicons/octicons.generated'
import {
  DropdownState,
  ToolbarDropdown,
  ToolbarDropdownStyle,
} from './dropdown'
import { OpenRepositoryButtonDropdown } from './open-repository-button-dropdown'

interface IOpenRepositoryButtonProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly selectedExternalEditor: string | null
  readonly isVisualStudioCodeAvailable: boolean
  readonly isVisualStudioAvailable: boolean
  readonly shellLabel: string
  readonly isDropdownOpen: boolean
  readonly enableFocusTrap: boolean
  readonly onDropdownStateChanged: (state: DropdownState) => void
}

export class OpenRepositoryButton extends React.Component<IOpenRepositoryButtonProps> {
  private closeDropdown() {
    this.props.dispatcher.closeFoldout(FoldoutType.OpenRepository)
  }

  private openInExternalEditor = () => {
    this.closeDropdown()
    this.props.dispatcher.openInExternalEditor(this.props.repository.path)
  }

  private openInVisualStudioCode = () => {
    this.closeDropdown()
    this.props.dispatcher.openInSelectedExternalEditor(
      this.props.repository.path,
      'Visual Studio Code',
      null
    )
  }

  private openInVisualStudio = () => {
    this.closeDropdown()
    this.props.dispatcher.openInVisualStudio(this.props.repository)
  }

  private openInShell = () => {
    this.closeDropdown()
    this.props.dispatcher.openShell(this.props.repository.path)
  }

  private showInExplorer = () => {
    this.closeDropdown()
    shell.showFolderContents(this.props.repository.path)
  }

  private renderDropdown = () => (
    <OpenRepositoryButtonDropdown
      isVisualStudioCodeAvailable={this.props.isVisualStudioCodeAvailable}
      isVisualStudioAvailable={this.props.isVisualStudioAvailable}
      shellLabel={this.props.shellLabel}
      openInVisualStudioCode={this.openInVisualStudioCode}
      openInVisualStudio={this.openInVisualStudio}
      openInShell={this.openInShell}
      showInExplorer={this.showInExplorer}
    />
  )

  public render() {
    const selectedExternalEditor =
      this.props.selectedExternalEditor ?? 'external editor'

    return (
      <ToolbarDropdown
        className="open-repository-toolbar-button"
        buttonClassName="open-repository-button"
        dropdownStyle={ToolbarDropdownStyle.MultiOption}
        dropdownState={this.props.isDropdownOpen ? 'open' : 'closed'}
        onDropdownStateChanged={this.props.onDropdownStateChanged}
        dropdownContentRenderer={this.renderDropdown}
        enableFocusTrap={this.props.enableFocusTrap}
        title={`Open in ${selectedExternalEditor}`}
        tooltip={`Open repository in ${selectedExternalEditor}`}
        icon={octicons.code}
        onClick={this.openInExternalEditor}
        disabled={this.props.selectedExternalEditor === null}
        ariaLabel="Open repository options"
      />
    )
  }
}
