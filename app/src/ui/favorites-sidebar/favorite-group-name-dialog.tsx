import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { FavoriteGroup } from '../../models/favorite-group'
import { Dialog, DialogContent, DialogError, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Ref } from '../lib/ref'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
import { MaxFavoriteTabs } from '../../lib/stores/app-store'

type IProps =
  | {
      readonly dispatcher: Dispatcher
      readonly existingGroups: ReadonlyArray<FavoriteGroup>
      readonly onDismissed: () => void
      readonly mode: 'create'
      readonly repository?: Repository
    }
  | {
      readonly dispatcher: Dispatcher
      readonly existingGroups: ReadonlyArray<FavoriteGroup>
      readonly onDismissed: () => void
      readonly mode: 'rename'
      readonly groupId: number
      readonly currentName: string
    }

interface IState {
  readonly name: string
  /**
   * True while the dispatcher call from `onSubmit` is in flight. Disables
   * the dialog so repeated Enter presses or in-flight name edits can't
   * trigger duplicate creates.
   */
  readonly submitting: boolean
  /**
   * Set when the underlying dispatcher call rejects (e.g. a race against
   * another window). Cleared on the next keystroke. The case-insensitive
   * precheck on `existingGroups` covers the common duplicate-name path
   * before the user can submit; this is the belt-and-braces fallback.
   */
  readonly submitError: string | null
}

export class FavoriteGroupNameDialog extends React.Component<IProps, IState> {
  public constructor(props: IProps) {
    super(props)
    this.state = {
      name: props.mode === 'rename' ? props.currentName : '',
      submitting: false,
      submitError: null,
    }
  }

  public render() {
    const isRename = this.props.mode === 'rename'
    const title = isRename
      ? __DARWIN__
        ? 'Rename Favorites Group'
        : 'Rename favorites group'
      : __DARWIN__
      ? 'New Favorites Group'
      : 'New favorites group'
    const okText = isRename ? 'Rename' : 'Create'
    const description = isRename
      ? 'Choose a new name for this favorites group.'
      : 'Group your favorites under a name (e.g. Work, Personal).'

    const trimmed = this.state.name.trim()
    const isDuplicate = trimmed.length > 0 && this.isNameTaken(trimmed)
    const atLimit =
      this.props.mode === 'create' &&
      this.props.existingGroups.length >= MaxFavoriteTabs
    const error = this.renderError(trimmed, isDuplicate, atLimit)
    const okDisabled = atLimit || trimmed.length === 0 || isDuplicate

    return (
      <Dialog
        id="favorite-group-name-dialog"
        title={title}
        ariaDescribedBy="favorite-group-name-description"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        disabled={this.state.submitting}
        loading={this.state.submitting}
      >
        {error && <DialogError>{error}</DialogError>}
        <DialogContent>
          <p id="favorite-group-name-description">{description}</p>
          <Row>
            <TextBox
              ariaLabel="Group name"
              placeholder="e.g. Work, Personal, OSS"
              value={this.state.name}
              onValueChanged={this.onNameChanged}
            />
          </Row>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={okText}
            okButtonDisabled={okDisabled}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private renderError(
    trimmed: string,
    isDuplicate: boolean,
    atLimit: boolean
  ): JSX.Element | null {
    if (atLimit) {
      return (
        <>
          You already have {MaxFavoriteTabs} favorites groups, which is the
          maximum. Delete one before creating a new group.
        </>
      )
    }
    if (isDuplicate) {
      return (
        <>
          A favorites group named <Ref>{trimmed}</Ref> already exists.
        </>
      )
    }
    if (this.state.submitError !== null) {
      return <>{this.state.submitError}</>
    }
    return null
  }

  private isNameTaken(trimmed: string): boolean {
    const selfId = this.props.mode === 'rename' ? this.props.groupId : null
    const lower = trimmed.toLowerCase()
    return this.props.existingGroups.some(
      g => g.id !== selfId && g.name.toLowerCase() === lower
    )
  }

  private onNameChanged = (name: string) =>
    this.setState({ name, submitError: null })

  private onSubmit = async () => {
    if (this.state.submitting) {
      return
    }
    const trimmed = this.state.name.trim()
    if (trimmed.length === 0 || this.isNameTaken(trimmed)) {
      return
    }

    this.setState({ submitting: true, submitError: null })
    try {
      if (this.props.mode === 'rename') {
        await this.props.dispatcher.renameFavoriteGroup(
          this.props.groupId,
          trimmed
        )
      } else {
        const group = await this.props.dispatcher.addFavoriteGroup(trimmed)
        if (this.props.repository !== undefined) {
          await this.props.dispatcher.setRepositoryFavoriteGroup(
            this.props.repository,
            group.id
          )
        }
      }
    } catch (e) {
      this.setState({
        submitting: false,
        submitError:
          e instanceof Error
            ? e.message
            : 'Could not save the favorites group.',
      })
      return
    }

    this.props.onDismissed()
  }
}
