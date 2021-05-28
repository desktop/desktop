import * as React from 'react'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import { Ref } from '../lib/ref'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'

interface ICloneGenericRepositoryProps {
  /** The URL to clone. */
  readonly url: string

  /** The path to which the repository should be cloned. */
  readonly path: string

  /** Whether or not the user wants to perform a fast clone. */
  readonly fastClone: boolean

  /** Called when the destination path changes. */
  readonly onPathChanged: (path: string) => void

  /** Called when the URL to clone changes. */
  readonly onUrlChanged: (url: string) => void

  /** Called when the fast clone checkbox changes. */
  readonly onFastCloneChanged: (fastClone: boolean) => void

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
          <Button onClick={this.props.onChooseDirectory}>Choose…</Button>
        </Row>
        <Row className="fast-clone-row">
          <Checkbox
            value={this.props.fastClone ? CheckboxValue.On : CheckboxValue.Off}
            onChange={this.onFastCloneChange}
            label={this.renderFastCloneLabel()}
          />
        </Row>
      </DialogContent>
    )
  }

  private renderFastCloneLabel() {
    return (
      <span>
        {__DARWIN__ ? 'Blobless Clone' : 'Blobless clone'}
        {' (faster, '}
        <LinkButton uri="https://github.blog/2020-12-21-get-up-to-speed-with-partial-clone-and-shallow-clone/">
          learn more
        </LinkButton>
        {')'}
      </span>
    )
  }

  private onFastCloneChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.props.onFastCloneChanged(event.currentTarget.checked)
  }

  private onUrlChanged = (url: string) => {
    this.props.onUrlChanged(url)
  }
}
