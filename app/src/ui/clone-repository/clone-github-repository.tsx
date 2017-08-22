import * as React from 'react'
import { getDefaultDir } from '../lib/default-dir'
import { DialogContent } from '../dialog'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Button } from '../lib/button'
import { FilterList } from '../lib/filter-list'
import { IFilterListItem, IFilterListGroup } from '../lib/filter-list'
import { IAPIRepository } from '../../lib/api'
//import { API } from '../../lib/api'

interface IClonableRepositoryListItem extends IFilterListItem {
  readonly id: string
  readonly text: string
  readonly isPrivate: boolean
  readonly org: string
  readonly name: string
  readonly url: string
}

interface ICloneGithubRepositoryProps {
  readonly repositories: ReadonlyArray<IAPIRepository>
  readonly onPathChanged: (path: string) => void
  readonly onDismissed: () => void
  readonly onChooseDirectory: () => Promise<string | undefined>
}

interface ICloneGithubRepositoryState {
  readonly url: string
  readonly path: string
  readonly repositoryName: string
  readonly repositories: ReadonlyArray<
    IFilterListGroup<IClonableRepositoryListItem>
  >
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
      url: '',
      path: getDefaultDir(),
      repositoryName: '',
      repositories: [],
    }
  }

  public componentDidMount() {
    const repos: ReadonlyArray<
      IClonableRepositoryListItem
    > = this.props.repositories.map(repo => {
      return {
        id: repo.html_url,
        text: `${repo.owner.login}/${repo.name}`,
        url: repo.clone_url,
        org: repo.owner.login,
        name: repo.name,
        isPrivate: repo.private,
      }
    })

    const group = [
      {
        identifier: '',
        items: repos,
      },
    ]

    this.setState({
      repositories: group,
    })
  }

  public render() {
    const selectedItem: IClonableRepositoryListItem | null = null

    return (
      <DialogContent>
        <Row>
          <ClonableRepositoryFilterList
            className="clone-github-repo"
            rowHeight={RowHeight}
            selectedItem={selectedItem}
            renderItem={this.renderItem}
            renderGroupHeader={this.renderGroupHeader}
            onItemClick={this.onItemClicked}
            onFilterKeyDown={this.onFilterKeyDown}
            invalidationProps={this.props.repositories}
            groups={this.state.repositories}
          />
        </Row>

        <Row>
          <TextBox
            value={this.state.path}
            label={__DARWIN__ ? 'Local Path' : 'Local path'}
            placeholder="repository path"
            onValueChanged={this.onPathChanged}
          />
          <Button onClick={this.onChooseDirectory}>Choose…</Button>
        </Row>
      </DialogContent>
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
    console.log('onItemClicked')
  }

  private onChooseDirectory = async () => {
    const path = await this.props.onChooseDirectory()

    if (path) {
      this.setState({ path })
    }
  }

  private onPathChanged = (path: string) => {
    this.setState({ path })
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
