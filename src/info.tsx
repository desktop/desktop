import * as React from 'react'

import User from './models/user'
import Repository from './models/repository'
import { WorkingDirectoryStatus, WorkingDirectoryFileChange} from './models/status'

import LocalGitOperations from './lib/local-git-operations'

import ChangedFile from './changed-file'
import CommitForm from './commit-form'

interface InfoProps {
  selectedRepo: Repository,
  user: User
}

interface InfoState {
  exists: boolean
  workingDirectory: WorkingDirectoryStatus
}

export default class Info extends React.Component<InfoProps, InfoState> {

  public constructor(props: InfoProps) {
    super(props)

    this.state = {
      workingDirectory: new WorkingDirectoryStatus(),
      exists: true
    }
  }

  private refresh(repository: Repository) {
    LocalGitOperations.getStatus(repository)
      .then(result => this.setState({
        exists: result.getExists(),
        workingDirectory: result.getWorkingDirectory()
      }))
  }

  public componentWillReceiveProps(nextProps: InfoProps) {
    this.refresh(nextProps.selectedRepo)
  }

  private handleIncludedChange(file: WorkingDirectoryFileChange, include: boolean) {
    file.setIncluded(include)
  }

  private handleCreateCommit(title: string) {
    const files = this.state.workingDirectory.getFiles().filter(function(file, index, array) {
      return file.getIncluded() === true
    })

    LocalGitOperations.createCommit(this.props.selectedRepo, title, files)

    this.refresh(this.props.selectedRepo)
  }

  private renderNoSelection() {
    return (
      <div>
        <div>No repo selected!</div>
      </div>
    )
  }

  private renderNotFound(repo: Repository) {
    return (
      <div>
        <div>{repo.getPath()}</div>
        <br />
        <div>Repository not found at this location...</div>
      </div>
    )
  }

  private renderNoChanges(repo: Repository) {
    return (
      <div>
        <div>{repo.getPath()}</div>
        <br />
        <div>No local changes...</div>
      </div>
    )
  }

  private renderList(repo: Repository, files: WorkingDirectoryFileChange[]) {
    return (
      <div>
        <div>{repo.getPath()}</div>
        <br />
        <ul>{files.map(file => {
          const path = file.getPath()
          return <ChangedFile path={path}
                              status={file.getStatus()}
                              key={path}
                              handleIncludedChange={include => this.handleIncludedChange(file, include)}/>
        })}
        </ul>
        <CommitForm onCreateCommit={title => this.handleCreateCommit(title)}  />
      </div>
    )
  }

  public render() {
    const repo = this.props.selectedRepo
    if (!repo) {
      return this.renderNoSelection()
    }

    if (!this.state.exists) {
      return this.renderNotFound(repo)
    }

    const files = this.state.workingDirectory.getFiles()

    if (files.length === 0) {
      return this.renderNoChanges(repo)
    }

    return this.renderList(repo, files)
  }
}
