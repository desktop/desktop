import * as React from 'react'
import { DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { ButtonGroup } from '../lib/button-group'

const HelpURL = 'https://help.github.com/articles/about-remote-repositories/'

interface INoRemoteProps {
  /** The function to call when the users chooses to publish to github. */
  readonly onPublish: () => void
  readonly onUseCustomRemote: () => void
}

/** The component for when a repository has no remote. */
export class NoRemote extends React.Component<INoRemoteProps, {}> {
  public render() {
    return (
      <div>
        <DialogContent>
          Publish your repository to GitHub. Need help?{' '}
          <LinkButton uri={HelpURL}>Learn more</LinkButton> about remote
          repositories.
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit" onClick={this.props.onPublish}>
              Publish to GitHub
            </Button>
            <Button onClick={this.props.onUseCustomRemote}>
              {__DARWIN__ ? 'Setup Custom Remote' : 'Setup custom remote'}
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </div>
    )
  }
}
