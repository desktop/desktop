import * as React from 'react'
import { getDefaultDir } from '../lib/default-dir'
import { DialogContent } from '../dialog'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Button } from '../lib/button'
import { FilterList } from '../lib/filter-list'
import { IFilterListItem } from '../lib/filter-list'
//import { API } from '../../lib/api'

interface IClonableRepositoryListItem extends IFilterListItem {
  readonly id: string
  readonly org: string
  readonly name: string
  readonly url: string
}

interface ICloneGithubRepositoryProps {
  //readonly api: API
  //readonly user: string
  readonly onPathChanged: (path: string) => void
  readonly onDismissed: () => void
  readonly onChooseDirectory: () => Promise<string | undefined>
}

interface ICloneGithubRepositoryState {
  readonly url: string
  readonly path: string
  readonly repositoryName: string
  readonly repositories: ReadonlyArray<IClonableRepositoryListItem>
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

  public render() {
    // this.getUserRepositories(this.props.user)
    //   .then(repos => {
    //     if (repos) {
    //       for (const repo in repos) {
    //         console.log(repo)
    //       }
    //     }
    //   })
    //   .catch(error => console.error(error))

    const selectedItem: IClonableRepositoryListItem | null = null

    return (
      <DialogContent>
        <Row>
          <ClonableRepositoryFilterList
            rowHeight={RowHeight}
            selectedItem={selectedItem}
            renderItem={this.renderItem}
            onItemClick={this.onItemClicked}
            onFilterKeyDown={this.onFilterKeyDown}
            invalidationProps={this.state.repositories}
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

  private renderItem = (item: IClonableRepositoryListItem) => {
    return null
  }

  //private async getUserRepositories(user: string) {
  //const repos = await this.props.api.fetchRepositories(user)
  //
  // return repos
  //}
}
