import * as React from 'react'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface IAttributeMismatchProps {
  /** Called when the dialog should be dismissed. */
  readonly onDismissed: () => void

  /** Called when the user has chosen to replace the update filters. */
  readonly onUpdateExistingFilters: () => void
}

export class AttributeMismatch extends React.Component<
  IAttributeMismatchProps,
  {}
> {
  public render() {
    return (
      <Dialog
        id="lfs-attribute-mismatch"
        title={
          __DARWIN__ ? (
            'Update Existing Git LFS Filters?'
          ) : (
            'Update existing Git LFS filters?'
          )
        }
        onDismissed={this.props.onDismissed}
        onSubmit={this.props.onUpdateExistingFilters}
      >
        <DialogContent>
          <p>
            Git LFS filters are already configured in your global git config but
            are not the values it expects. Would you like to update them now?
          </p>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">
              {__DARWIN__ ? (
                'Update Existing Filters'
              ) : (
                'Update existing filters'
              )}
            </Button>
            <Button onClick={this.props.onDismissed}>
              {__DARWIN__ ? 'Not Now' : 'Not now'}
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
