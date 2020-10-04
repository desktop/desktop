import * as React from 'react'

import { Account } from '../../models/account'
import { DialogContent } from '../dialog'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Button } from '../lib/button'
import { IAPIRepository } from '../../lib/api'
import { CloneableRepositoryFilterList } from './cloneable-repository-filter-list'
import { ClickSource } from '../lib/list'

interface ICloneGithubRepositoryProps {
  /** The account to clone from. */
  readonly account: Account

  /** The path to clone to. */
  readonly path: string

  /** Called when the destination path changes. */
  readonly onPathChanged: (path: string) => void

  /**
   * Called when the user should be prompted to choose a destination directory.
   */
  readonly onChooseDirectory: () => Promise<string | undefined>

  /**
   * The currently selected repository, or null if no repository
   * is selected.
   */
  readonly selectedItem: IAPIRepository | null

  /** Called when a repository is selected. */
  readonly onSelectionChanged: (selectedItem: IAPIRepository | null) => void

  /**
   * The list of repositories that the account has explicit permissions
   * to access, or null if no repositories has been loaded yet.
   */
  readonly repositories: ReadonlyArray<IAPIRepository> | null

  /**
   * Whether or not the list of repositories is currently being loaded
   * by the API Repositories Store. This determines whether the loading
   * indicator is shown or not.
   */
  readonly loading: boolean

  /**
   * The contents of the filter text box used to filter the list of
   * repositories.
   */
  readonly filterText: string

  /**
   * Called when the filter text is changed by the user entering a new
   * value in the filter text box.
   */
  readonly onFilterTextChanged: (filterText: string) => void

  /**
   * Called when the user requests a refresh of the repositories
   * available for cloning.
   */
  readonly onRefreshRepositories: (account: Account) => void

  /**
   * This function will be called when a pointer device is pressed and then
   * released on a selectable row. Note that this follows the conventions
   * of button elements such that pressing Enter or Space on a keyboard
   * while focused on a particular row will also trigger this event. Consumers
   * can differentiate between the two using the source parameter.
   *
   * Consumers of this event do _not_ have to call event.preventDefault,
   * when this event is subscribed to the list will automatically call it.
   */
  readonly onItemClicked: (
    repository: IAPIRepository,
    source: ClickSource
  ) => void
}

export class CloneGithubRepository extends React.PureComponent<
  ICloneGithubRepositoryProps
> {
  public render() {
    return (
      <DialogContent className="clone-github-repository-content">
        <Row>
          <CloneableRepositoryFilterList
            account={this.props.account}
            selectedItem={this.props.selectedItem}
            onSelectionChanged={this.props.onSelectionChanged}
            loading={this.props.loading}
            repositories={this.props.repositories}
            filterText={this.props.filterText}
            onFilterTextChanged={this.props.onFilterTextChanged}
            onRefreshRepositories={this.props.onRefreshRepositories}
            onItemClicked={this.props.onItemClicked}
          />
        </Row>

        <Row className="local-path-field">
          <TextBox
            value={this.props.path}
            label={__DARWIN__ ? 'Local Path' : 'Local path'}
            placeholder="repository path"
            onValueChanged={this.props.onPathChanged}
          />
          <Button onClick={this.props.onChooseDirectory}>Choose…</Button>
        </Row>
      </DialogContent>
    )
  }
}
