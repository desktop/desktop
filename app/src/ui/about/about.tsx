import * as React from 'react'

import { Row } from '../lib/row'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Octicon, OcticonSymbol } from '../octicons'

interface IAboutProps {
  readonly onDismissed: () => void
  readonly version: string
}

/** The Create Branch component. */
export class About extends React.Component<IAboutProps, void> {

  public render() {

    return (
      <Dialog
        id='about'
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}>
        <DialogContent>
          <Row className='logo'>
            <Octicon symbol={OcticonSymbol.markGithub} />
          </Row>
          <h2>GitHub Desktop</h2>
          <p>Installed version {this.props.version}</p>
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
