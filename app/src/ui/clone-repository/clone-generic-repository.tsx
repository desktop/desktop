import * as React from 'react'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import { Ref } from '../lib/ref'

interface ICloneGenericRepositoryProps {
  /** The URL to clone. */
  readonly url: string

  /** The path to which the repository should be cloned. */
  readonly path: string

  /** Called when the destination path changes. */
  readonly onPathChanged: (path: string) => void

  /** Called when the URL to clone changes. */
  readonly onUrlChanged: (url: string) => void

  /**
   * Called when the user should be prompted to choose a directory to clone to.
   */
  readonly onChooseDirectory: () => Promise<string | undefined>
}

/** The component for cloning a repository. */
export class CloneGenericRepository extends React.Component<
  ICloneGenericRepositoryProps,
  {}
> {
  public render() {
    return (
      <DialogContent className="clone-generic-repository-content">
        <Row>
          <TextBox
            placeholder="URL or username/repository"
            value={this.props.url}
            onValueChanged={this.onUrlChanged}
            autoFocus={true}
            label={
              <span>
                Repository URL or GitHub username and repository
                <br />(<Ref>hubot/cool-repo</Ref>)
              </span>
            }
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
