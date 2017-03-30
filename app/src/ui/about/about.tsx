import * as React from 'react'

import { Row } from '../lib/row'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface IAboutProps {
  readonly onDismissed: () => void
  readonly version: string
}

/** The Create Branch component. */
export class About extends React.Component<IAboutProps, void> {

  public render() {

    return (
      <Dialog
        title='About GitHub Desktop'
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}>
        <DialogContent>
          <Row>
            {this.props.version}
          </Row>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type='submit'>Close</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
