import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { sanitizedRefName } from '../../lib/sanitize-ref-name'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Dialog, DialogError, DialogContent, DialogFooter } from '../dialog'

import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { startTimer } from '../lib/timing'
import { Octicon, OcticonSymbol } from '../octicons'
import { Ref } from '../lib/ref'

interface ICreateTagProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly targetCommitSha: string
  readonly initialName?: string
}

interface ICreateTagState {
  readonly proposedName: string
  readonly sanitizedName: string

  /**
   * Note: once tag creation has been initiated this value stays at true
   * and will never revert to being false. If the tag creation operation
   * fails this dialog will still be dismissed and an error dialog will be
   * shown in its place.
   */
  readonly isCreatingTag: boolean

  readonly localTags: Set<string>
}

const MaxTagNameLength = 245

/** The Create Tag component. */
export class CreateTag extends React.Component<
  ICreateTagProps,
  ICreateTagState
> {
  public constructor(props: ICreateTagProps) {
    super(props)

    const proposedName = props.initialName || ''

    this.state = {
      proposedName,
      sanitizedName: sanitizedRefName(proposedName),
      isCreatingTag: false,
      localTags: new Set(),
    }
  }

  public async componentDidMount() {
    // Get the existing tags so we can warn the user that the chosen tag already
    // exists before submitting.
    // Since this is just an UX improvement, we don't need to block the rendering
    // of the dialog (or show any loader) while we get the tags.
    const localTags = await this.props.dispatcher.getAllTags(
      this.props.repository
    )

    this.setState({
      localTags: new Set(localTags),
    })
  }

  public render() {
    const error = this.getCurrentError()
    const disabled = error !== null || this.state.proposedName.length === 0

    return (
      <Dialog
        id="create-tag"
        title={__DARWIN__ ? 'Create a Tag' : 'Create a tag'}
        onSubmit={this.createTag}
        onDismissed={this.props.onDismissed}
        loading={this.state.isCreatingTag}
        disabled={this.state.isCreatingTag}
      >
        {error && <DialogError>{error}</DialogError>}

        <DialogContent>
          <Row>
            <TextBox
              label="Name"
              value={this.state.proposedName}
              autoFocus={true}
              onValueChanged={this.updateTagName}
            />
          </Row>

          {this.renderTagNameWarning()}
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Create Tag' : 'Create tag'}
            okButtonDisabled={disabled}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private renderTagNameWarning() {
    const { proposedName, sanitizedName } = this.state

    if (proposedName !== sanitizedName) {
      return (
        <Row className="warning-helper-text">
          <Octicon symbol={OcticonSymbol.alert} />
          <p>
            Will be created as <Ref>{sanitizedName}</Ref>.
          </p>
        </Row>
      )
    } else {
      return null
    }
  }

  private getCurrentError(): JSX.Element | null {
    const { sanitizedName, proposedName } = this.state

    if (sanitizedName.length > MaxTagNameLength) {
      return (
        <>The tag name cannot be longer than {MaxTagNameLength} characters</>
      )
    }

    // Show an error if the sanitization logic causes the tag name to be an empty
    // string (we only want to show this if the user has already typed something).
    if (proposedName.length > 0 && sanitizedName.length === 0) {
      return <>Invalid tag name.</>
    }

    const alreadyExists = this.state.localTags.has(sanitizedName)
    if (alreadyExists) {
      return (
        <>
          A tag named <Ref>{sanitizedName}</Ref> already exists
        </>
      )
    }

    return null
  }

  private updateTagName = (name: string) => {
    this.setState({
      proposedName: name,
      sanitizedName: sanitizedRefName(name),
    })
  }

  private createTag = async () => {
    const name = this.state.sanitizedName
    const repository = this.props.repository

    if (name.length > 0) {
      this.setState({ isCreatingTag: true })

      const timer = startTimer('create tag', repository)
      await this.props.dispatcher.createTag(
        repository,
        name,
        this.props.targetCommitSha
      )
      timer.done()
    }
  }
}
