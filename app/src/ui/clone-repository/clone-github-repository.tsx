import * as React from 'react'

import { Account } from '../../models/account'
import { DialogContent } from '../dialog'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Button } from '../lib/button'
import { Loading } from '../lib/loading'
import { FilterList } from '../lib/filter-list'
import { API } from '../../lib/api'
import { IFilterListGroup } from '../lib/filter-list'
import {
  IClonableRepositoryListItem,
  groupRepositories,
} from './group-repositories'

interface ICloneGithubRepositoryProps {
  readonly api: API
  readonly account: Account
  readonly path: string
  readonly onPathChanged: (path: string) => void
  readonly onDismissed: () => void
  readonly onChooseDirectory: () => Promise<string | undefined>
  readonly onGitHubRepositorySelected: (url: string) => void
}

interface ICloneGithubRepositoryState {
  readonly loading: boolean
  readonly repositoryName: string
  readonly repositories: ReadonlyArray<
    IFilterListGroup<IClonableRepositoryListItem>
  >
  readonly selectedItem: IClonableRepositoryListItem | null
}

const ClonableRepositoryFilterList: new () => FilterList<
  IClonableRepositoryListItem
> = FilterList as any
const RowHeight = 29

export class CloneGithubRepository extends React.Component<
  ICloneGithubRepositoryProps,
  ICloneGithubRepositoryState
> {
  public constructor(props: ICloneGithubRepositoryProps) {
    super(props)

    this.state = {
      loading: false,
      repositoryName: '',
      repositories: [],
      selectedItem: null,
    }
  }

  public async componentDidMount() {
    this.setState({
      loading: true,
    })

    const result = await this.props.api.fetchRepositories()

    const repositories = result
      ? groupRepositories(result, this.props.account.login)
      : []

    this.setState({
      repositories,
      loading: false,
    })
  }

  public render() {
    return (
      <DialogContent>
        <Row>
          {this.renderRepositoryList()}
        </Row>

        <Row>
          <TextBox
            value={this.props.path}
            label={__DARWIN__ ? 'Local Path' : 'Local path'}
            placeholder="repository path"
            onValueChanged={this.onPathChanged}
          />
          <Button onClick={this.onChooseDirectory}>Choose…</Button>
        </Row>
      </DialogContent>
    )
  }

  private renderRepositoryList() {
    if (this.state.loading) {
      return (
        <div className="clone-github-repo">
          <Loading />
        </div>
      )
    }

    return (
      <ClonableRepositoryFilterList
        className="clone-github-repo"
        rowHeight={RowHeight}
        selectedItem={this.state.selectedItem}
        renderItem={this.renderItem}
        renderGroupHeader={this.renderGroupHeader}
        onItemClick={this.onItemClicked}
        onFilterKeyDown={this.onFilterKeyDown}
        invalidationProps={this.state.repositories}
        groups={this.state.repositories}
      />
    )
  }

  private onFilterKeyDown = (
    filter: string,
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'Escape') {
      if (filter.length === 0) {
        this.props.onDismissed()
        event.preventDefault()
      }
    }
  }

  private onItemClicked = (item: IClonableRepositoryListItem) => {
    this.setState({ selectedItem: item })
    this.props.onGitHubRepositorySelected(item.url)
  }

  private onChooseDirectory = async () => {
    const path = await this.props.onChooseDirectory()

    if (path) {
      this.props.onPathChanged(path)
    }
  }

  private onPathChanged = (path: string) => {
    this.props.onPathChanged(path)
  }

  private renderGroupHeader = (header: string) => {
    return (
      <strong>
        {header}
      </strong>
    )
  }

  private renderItem = (item: IClonableRepositoryListItem) => {
    return (
      <p>
        {item.text}
      </p>
    )
  }
}
