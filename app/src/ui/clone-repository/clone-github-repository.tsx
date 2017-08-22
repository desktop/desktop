import * as React from 'react'
import { getDefaultDir } from '../lib/default-dir'
import { DialogContent } from '../dialog'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Button } from '../lib/button'
import { FilterList } from '../lib/filter-list'
import { IFilterListItem, IFilterListGroup } from '../lib/filter-list'
import { API } from '../../lib/api'
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
  readonly api: API
  readonly onPathChanged: (path: string) => void
  readonly onDismissed: () => void
  readonly onChooseDirectory: () => Promise<string | undefined>
  readonly onGitHubRepositorySelected: (url: string) => void
}

interface ICloneGithubRepositoryState {
  readonly url: string
  readonly path: string
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
      url: '',
      path: getDefaultDir(),
      repositoryName: '',
      repositories: [],
      selectedItem: null,
    }
  }

  public async componentDidMount() {
    const repositories = await this.props.api.fetchRepositories()

    if (repositories) {
      const repos: ReadonlyArray<
        IClonableRepositoryListItem
      > = repositories.map(repo => {
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
          identifier: 'Remote',
          items: repos,
        },
      ]

      this.setState({
        repositories: group,
      })
    }
  }

  public render() {
    return (
      <DialogContent>
        <Row>
          <ClonableRepositoryFilterList
            className="clone-github-repo"
            rowHeight={RowHeight}
            selectedItem={this.state.selectedItem}
            renderItem={this.renderItem}
            onItemClick={this.onItemClicked}
            onFilterKeyDown={this.onFilterKeyDown}
            invalidationProps={this.state.repositories}
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
    this.setState({ selectedItem: item })
    this.props.onGitHubRepositorySelected(item.url)
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

  private renderItem = (item: IClonableRepositoryListItem) => {
    return (
      <p>
        {item.text}
      </p>
    )
  }
}
