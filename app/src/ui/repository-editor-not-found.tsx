import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from './dialog'
import { OkCancelButtonGroup } from './dialog/ok-cancel-button-group'
import { Repository } from '../models/repository'
import { Row } from './lib/row'
import { Button } from './lib/button'

interface IRepositoryEditorNotFoundProps {
  readonly message: string
  readonly repository: Repository
  readonly onDismissed: () => void
  readonly onUseGlobalDefault: (repository: Repository) => void
  readonly onOpenRepositorySettings: (repository: Repository) => void
}

export class RepositoryEditorNotFound extends React.Component<IRepositoryEditorNotFoundProps> {
  private onUseGlobalDefault = () => {
    this.props.onUseGlobalDefault(this.props.repository)
    this.props.onDismissed()
  }

  private onOpenSettings = () => {
    this.props.onOpenRepositorySettings(this.props.repository)
    this.props.onDismissed()
  }

  public render() {
    return (
      <Dialog
        id="repository-editor-not-found"
        title="Editor Not Found"
        onDismissed={this.props.onDismissed}
        onSubmit={this.props.onDismissed}
        type="error"
      >
        <DialogContent>
          <Row>{this.props.message}</Row>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup okButtonText="Close" cancelButtonVisible={false}>
            <Button onClick={this.onUseGlobalDefault}>
              Use Global Default
            </Button>
            <Button onClick={this.onOpenSettings}>Choose Editor</Button>
          </OkCancelButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
