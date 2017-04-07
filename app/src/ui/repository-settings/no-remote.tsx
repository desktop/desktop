import * as React from 'react'
import { DialogContent } from '../dialog'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { LinkButton } from '../lib/link-button'

const HelpURL = 'https://help.github.com/articles/about-remote-repositories/'

interface INoRemoteProps {
  /** The function to call when the users chooses to publish. */
  readonly onPublish: () => void
}

/** The component for when a repository has no remote. */
export class NoRemote extends React.Component<INoRemoteProps, void> {
  public render() {
    return (
      <DialogContent>
        <Row className='no-remote'>
          <div>Publish your repository to GitHub. Need help? <LinkButton uri={HelpURL}>Learn more</LinkButton> about remote repositories.</div>
          <Button type='submit' onClick={this.onPublish}>Publish</Button>
        </Row>
      </DialogContent>
    )
  }

  private onPublish = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()

    this.props.onPublish()
  }
}
