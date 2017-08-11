import * as React from 'react'
import { getDefaultDir } from '../lib/default-dir'
import { DialogContent } from '../dialog'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Button } from '../lib/button'

interface ICloneGithubRepositoryProps {
  // readonly onError: (error: Error | null) => void
  readonly onPathChanged: (path: string) => void
  // readonly onUrlChanged: (url: string) => void
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
          {/* <Button onClick={this.pickAndSetDirectory}>Choose…</Button> */}
        </Row>
      </DialogContent>
    )
  }

  private onFilter = (s: string) => {
    this.setState({ repositoryName: s })
  }

  // private onSelection = (placeholder: string) => {
  //   this.setState({ url: placeholder })
  //   this.props.onUrlChanged(placeholder)
  // }

  private onPathChanged = (path: string) => {
    this.setState({ path })
    this.props.onPathChanged(path)
  }
}
