import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { RepositorySectionRenameTarget } from '../../models/popup'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'

interface IRenameRepositorySectionProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly target: RepositorySectionRenameTarget
}

interface IRenameRepositorySectionState {
  readonly name: string
}

/**
 * A dialog for renaming a custom group, or setting the display name of an
 * organization's section, in the repository list.
 */
export class RenameRepositorySection extends React.Component<
  IRenameRepositorySectionProps,
  IRenameRepositorySectionState
> {
  public constructor(props: IRenameRepositorySectionProps) {
    super(props)

    const { target } = props
    this.state = {
      name:
        target.kind === 'group'
          ? target.name
          : target.owner.alias ?? target.owner.login,
    }
  }

  public render() {
    const { target } = this.props
    const isGroup = target.kind === 'group'
    const title = isGroup
      ? __DARWIN__
        ? 'Rename Group'
        : 'Rename group'
      : __DARWIN__
      ? 'Rename Section'
      : 'Rename section'

    return (
      <Dialog
        id="rename-repository-section"
        title={title}
        ariaDescribedBy="rename-repository-section-description"
        onDismissed={this.props.onDismissed}
        onSubmit={this.rename}
      >
        <DialogContent>
          <p id="rename-repository-section-description">
            {target.kind === 'group'
              ? `Choose a new name for the group "${target.name}". Using the name of another group merges the two.`
              : `Choose how the "${target.owner.login}" section is named in the repository list.`}
          </p>
          <TextBox
            label="Name"
            value={this.state.name}
            onValueChanged={this.onNameChanged}
          />
          {!isGroup && (
            <p className="description">
              Leave it empty to show the original name. This will not affect the
              account or organization on GitHub.
            </p>
          )}
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Rename"
            okButtonDisabled={isGroup && this.state.name.trim().length === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onNameChanged = (name: string) => {
    this.setState({ name })
  }

  private rename = () => {
    const { target, dispatcher } = this.props

    if (target.kind === 'group') {
      dispatcher.renameRepositoryGroup(target.name, this.state.name)
    } else {
      dispatcher.changeOwnerAlias(target.owner, this.state.name)
    }
    this.props.onDismissed()
  }
}
