import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Category } from '../../models/category'
import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'

interface IRenameCategoryProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly category: Category
  /** All categories, used for case-insensitive uniqueness validation. */
  readonly categories: ReadonlyArray<Category>
}

interface IRenameCategoryState {
  readonly name: string
  readonly error: string | null
}

export class RenameCategory extends React.Component<
  IRenameCategoryProps,
  IRenameCategoryState
> {
  public constructor(props: IRenameCategoryProps) {
    super(props)
    this.state = { name: props.category.name, error: null }
  }

  public render() {
    const trimmed = this.state.name.trim()
    const unchanged =
      trimmed.toLowerCase() === this.props.category.name.toLowerCase()
    const disabled =
      trimmed.length === 0 || unchanged || this.state.error !== null

    return (
      <Dialog
        id="rename-category"
        title={__DARWIN__ ? 'Rename Category' : 'Rename category'}
        ariaDescribedBy="rename-category-description"
        onDismissed={this.props.onDismissed}
        onSubmit={this.rename}
      >
        {this.state.error !== null && (
          <DialogError>{this.state.error}</DialogError>
        )}
        <DialogContent>
          <p id="rename-category-description">
            Choose a new name for the category "{this.props.category.name}".
          </p>
          <p>
            <TextBox
              ariaLabel="Category name"
              autoFocus={true}
              value={this.state.name}
              onValueChanged={this.onNameChanged}
            />
          </p>
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Rename' : 'Rename'}
            okButtonDisabled={disabled}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onNameChanged = (name: string) => {
    const trimmed = name.trim()
    const lower = trimmed.toLowerCase()
    const isDuplicate = this.props.categories.some(
      c => c.id !== this.props.category.id && c.name.toLowerCase() === lower
    )
    this.setState({
      name,
      error: isDuplicate
        ? `A category named "${trimmed}" already exists.`
        : null,
    })
  }

  private rename = () => {
    const trimmed = this.state.name.trim()
    if (trimmed.length === 0 || this.state.error !== null) {
      return
    }
    this.props.dispatcher.renameCategory(this.props.category, trimmed)
    this.props.onDismissed()
  }
}
