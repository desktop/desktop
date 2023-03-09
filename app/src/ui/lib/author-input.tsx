import * as React from 'react'
import classNames from 'classnames'
import {
  UserAutocompletionProvider,
  AutocompletingInput,
} from '../autocompletion'
import { IAuthor } from '../../models/author'

interface IAuthorInputProps {
  /**
   * An optional class name for the wrapper element around the
   * author input component
   */
  readonly className?: string

  /**
   * The user autocomplete provider to use when searching for substring
   * matches while autocompleting.
   */
  readonly autoCompleteProvider: UserAutocompletionProvider

  /**
   * The list of authors to fill the input with initially. If this
   * prop changes from what's propagated through onAuthorsUpdated
   * while the component is mounted it will reset, loosing
   * any text that has not yet been resolved to an author.
   */
  readonly authors: ReadonlyArray<IAuthor>

  /**
   * A method called when authors has been added or removed from the
   * input field.
   */
  readonly onAuthorsUpdated: (authors: ReadonlyArray<IAuthor>) => void

  /**
   * Whether or not the input should be read-only and styled as being
   * disabled. When disabled the component will not accept focus.
   */
  readonly disabled: boolean
}

/**
 * Comparison method for use in sorting lists of markers in ascending
 * order of start positions.
 */
// function orderByPosition(x: ActualTextMarker, y: ActualTextMarker) {
//   const xPos = x.find()
//   const yPos = y.find()

//   if (xPos === undefined || yPos === undefined) {
//     return compare(xPos, yPos)
//   }

//   return compare(xPos.from, yPos.from)
// }

/**
 * Returns an email address which can be used on the host side to
 * look up the user which is to be given attribution.
 *
 * If the user has a public email address specified in their profile
 * that's used and if they don't then we'll generate a stealth email
 * address.
 */
// function getEmailAddressForUser(user: IUserHit) {
//   return user.email && user.email.length > 0
//     ? user.email
//     : getLegacyStealthEmailForUser(user.username, user.endpoint)
// }

// function getDisplayTextForAuthor(author: IAuthor) {
//   return author.username === null ? author.name : `@${author.username}`
// }

/**
 * Convert a IUserHit object which is returned from
 * user-autocomplete-provider into an IAuthor object.
 *
 * If the IUserHit object lacks an email address we'll
 * attempt to create a stealth email address.
 */
// function authorFromUserHit(user: IUserHit): IAuthor {
//   return {
//     name: user.name || user.username,
//     email: getEmailAddressForUser(user),
//     username: user.username,
//   }
// }

/**
 * Autocompletable input field for possible authors of a commit.
 *
 * Intended primarily for co-authors but written in a general enough
 * fashion to deal only with authors in general.
 */
export class AuthorInput extends React.Component<IAuthorInputProps> {
  /**
   * The internal list of authors. Note that codemirror
   * ultimately is the source of truth for what authors
   * are in here but we synchronize that into this field
   * whenever codemirror reports a change. We also use
   * this array to detect whether the author props have
   * change, in which case we blow away everything and
   * start from scratch.
   */
  // private authors: ReadonlyArray<IAuthor> = []

  // For undo association
  // private readonly markAuthorMap = new Map<ActualTextMarker, IAuthor>()
  // private readonly authorMarkMap = new Map<IAuthor, ActualTextMarker>()

  private textAreaRef = React.createRef<AutocompletingInput>()

  public constructor(props: IAuthorInputProps) {
    super(props)
  }

  public focus() {
    this.textAreaRef.current?.focus()
  }

  public render() {
    // const authors = this.props.authors.map(getDisplayTextForAuthor)
    // const ariaLabel = `Co-Authors: ${authors.join(', ')}`

    const className = classNames(
      'author-input-component',
      this.props.className,
      {
        disabled: this.props.disabled,
      }
    )

    return (
      <div className={className}>
        <div className="label">Co-Authors</div>
        <AutocompletingInput
          // className={descriptionClassName}
          placeholder="@username"
          // value={this.state.description || ''}
          // onValueChanged={this.onDescriptionChanged}
          autocompletionProviders={[this.props.autoCompleteProvider]}
          ref={this.textAreaRef}
          // onElementRef={this.onDescriptionTextAreaRef}
          // onContextMenu={this.onAutocompletingInputContextMenu}
          // disabled={this.props.isCommitting === true}
          // spellcheck={this.props.commitSpellcheckEnabled}
        />
      </div>
    )
  }
}
