import * as React from 'react'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import { Monospaced } from '../lib/monospaced'

interface ICloneGenericRepositoryProps {
  readonly url: string

  readonly path: string

  readonly onPathChanged: (path: string) => void

  readonly onUrlChanged: (url: string) => void

  readonly onChooseDirectory: () => Promise<string | undefined>
}

/** The component for cloning a repository. */
export class CloneGenericRepository extends React.Component<
  ICloneGenericRepositoryProps,
  {}
> {
  public constructor(props: ICloneGenericRepositoryProps) {
    super(props)
  }

  public render() {
    return (
      <DialogContent className="clone-generic-repository-content">
        <Row className="clone-url-row">
          <label>
            Enter a repository URL or GitHub username and repository
            <br />
            (e.g., <Monospaced>hubot/cool-repo</Monospaced>)
          </label>

          <TextBox
            placeholder="URL or username/repository"
            value={this.props.url}
            onValueChanged={this.onUrlChanged}
            autoFocus={true}
          />
        </Row>

        <Row>
          <TextBox
            value={this.props.path}
            label={__DARWIN__ ? 'Local Path' : 'Local path'}
            placeholder="repository path"
            onValueChanged={this.props.onPathChanged}
          />
          <Button onClick={this.onChooseDirectory}>Choose…</Button>
        </Row>
      </DialogContent>
    )
  }

  private onChooseDirectory = async () => {
    const path = await this.props.onChooseDirectory()

    if (path) {
      this.props.onPathChanged(path)
    }
  }

  private onUrlChanged = (url: string) => {
    this.props.onUrlChanged(url)
  }
}
