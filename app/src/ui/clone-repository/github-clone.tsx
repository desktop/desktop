import * as React from 'react'
import { getDefaultDir } from '../lib/default-dir'
import { DialogContent } from '../dialog'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Button } from '../lib/button'

interface ICloneGithubRepositoryProps {
  readonly onPathChanged: (path: string) => void
  readonly onChooseDirectory: () => Promise<string | undefined>
}

interface ICloneGithubRepositoryState {
  readonly url: string
  readonly path: string
  readonly repositoryName: string
}

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
    }
  }

  public render() {
    return (
      <DialogContent>
        <Row>
          <TextBox
            placeholder="Filter repos"
            value={this.state.repositoryName}
            onValueChanged={this.onFilter}
            autoFocus={true}
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

  private onFilter = (s: string) => {
    this.setState({ repositoryName: s })
  }
}
