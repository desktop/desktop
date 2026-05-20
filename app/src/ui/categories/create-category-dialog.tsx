import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { nameOf, Repository } from '../../models/repository'
import { Category } from '../../models/category'
import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'

interface ICreateCategoryProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  /** The repository to assign to the new category once created. */
  readonly repository: Repository
  /** Existing categories, used for case-insensitive uniqueness validation. */
  readonly categories: ReadonlyArray<Category>
}

interface ICreateCategoryState {
  readonly name: string
  readonly error: string | null
}

export class CreateCategory extends React.Component<
  ICreateCategoryProps,
  ICreateCategoryState
> {
  public constructor(props: ICreateCategoryProps) {
    super(props)
    this.state = { name: '', error: null }
  }

  public render() {
    const trimmed = this.state.name.trim()
    const disabled = trimmed.length === 0 || this.state.error !== null

    return (
      <Dialog
        id="create-category"
        title={__DARWIN__ ? 'New Category' : 'New category'}
        ariaDescribedBy="create-category-description"
        onDismissed={this.props.onDismissed}
        onSubmit={this.create}
      >
        {this.state.error !== null && (
          <DialogError>{this.state.error}</DialogError>
        )}
        <DialogContent>
          <p id="create-category-description">
            Create a new category and assign "{nameOf(this.props.repository)}"
            to it.
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
            okButtonText={__DARWIN__ ? 'Create' : 'Create'}
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
      c => c.name.toLowerCase() === lower
    )
    this.setState({
      name,
      error: isDuplicate
        ? `A category named "${trimmed}" already exists.`
        : null,
    })
  }

  private create = () => {
    const trimmed = this.state.name.trim()
    if (trimmed.length === 0 || this.state.error !== null) {
      return
    }
    this.props.dispatcher.createCategoryAndAssign(
      this.props.repository,
      trimmed
    )
    this.props.onDismissed()
  }
}
