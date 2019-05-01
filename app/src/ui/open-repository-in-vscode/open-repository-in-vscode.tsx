import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Row } from '../../ui/lib/row'
// import { Select } from '../lib/select'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'

interface IOpenRepositoryInVSCodeProps {
  /** The repository path */
  readonly repositoryPath: string

  /** The action to execute when the user cancels */
  readonly onDismissed: () => void
}

export class OpenRepositoryInVSCode extends React.Component<
  IOpenRepositoryInVSCodeProps,
  {}
> {
  public constructor(props: IOpenRepositoryInVSCodeProps) {
    super(props)
  }

  private cancel = () => {
    this.props.onDismissed()
  }

  public render() {
    return (
      <Dialog
        id="open-repository-in-vscode"
        type="normal"
        title={'Open the repository'}
        onSubmit={() => {
          console.log(this.props.repositoryPath)
        }}
        onDismissed={this.cancel}
      >
        <DialogContent>
          <Row>Which location will you open?</Row>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup destructive={true}>
            <Button type="submit">Open</Button>
            <Button onClick={this.cancel}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
