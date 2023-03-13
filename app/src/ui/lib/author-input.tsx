import * as React from 'react'
import classNames from 'classnames'
import {
  UserAutocompletionProvider,
  AutocompletingInput,
  UserHit,
  KnownUserHit,
} from '../autocompletion'
import { IAuthor } from '../../models/author'
import { getLegacyStealthEmailForUser } from '../../lib/email'
import memoizeOne from 'memoize-one'

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

interface IAuthorInputState {
  readonly focusedAuthorIndex: number
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
function getEmailAddressForUser(user: KnownUserHit) {
  return user.email && user.email.length > 0
    ? user.email
    : getLegacyStealthEmailForUser(user.username, user.endpoint)
}

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
function authorFromUserHit(user: KnownUserHit): IAuthor {
  return {
    name: user.name || user.username,
    email: getEmailAddressForUser(user),
    username: user.username,
  }
}

/**
 * Autocompletable input field for possible authors of a commit.
 *
 * Intended primarily for co-authors but written in a general enough
 * fashion to deal only with authors in general.
 */
export class AuthorInput extends React.Component<
  IAuthorInputProps,
  IAuthorInputState
> {
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

  private autocompletingInputRef =
    React.createRef<AutocompletingInput<UserHit>>()
  private shadowInputRef = React.createRef<HTMLDivElement>()
  private inputRef: HTMLInputElement | null = null
  private authorContainerRef = React.createRef<HTMLDivElement>()

  private getAutocompleteItemFilter = memoizeOne(
    (authors: ReadonlyArray<IAuthor>) => (item: UserHit) => {
      if (item.kind !== 'known-user') {
        return true
      }

      return !authors.some(a => a.username === item.username)
    }
  )

  public constructor(props: IAuthorInputProps) {
    super(props)

    this.state = {
      focusedAuthorIndex: -1,
    }
  }

  public componentDidUpdate(prevProps: IAuthorInputProps) {
    if (this.props.authors.length === prevProps.authors.length - 1) {
      // Check if current authors are a subset of prev authors, meaning an author
      // was removed
      const isSubset = this.props.authors.every(author =>
        prevProps.authors.some(
          prevAuthor =>
            prevAuthor.name === author.name &&
            prevAuthor.email === author.email &&
            prevAuthor.username === author.username
        )
      )
      if (isSubset) {
        // Keep focused author except if the last one was focused
        if (this.state.focusedAuthorIndex >= this.props.authors.length) {
          this.focusAuthorHandle(-1)
        } else {
          this.focusAuthorHandle(this.state.focusedAuthorIndex)
        }
      }
    }
  }

  public focus() {
    this.autocompletingInputRef.current?.focus()
  }

  public render() {
    const className = classNames(
      'author-input-component',
      this.props.className,
      {
        disabled: this.props.disabled,
      }
    )

    return (
      <div className={className}>
        <div className="label">Co-Authors&nbsp;</div>
        <div className="shadow-input" ref={this.shadowInputRef} />
        {this.renderAuthors()}
        <AutocompletingInput<UserHit>
          placeholder="@username"
          alwaysAutocomplete={true}
          autocompletionProviders={[this.props.autoCompleteProvider]}
          autocompleteItemFilter={this.getAutocompleteItemFilter(
            this.props.authors
          )}
          ref={this.autocompletingInputRef}
          onElementRef={this.onInputRef}
          onAutocompleteItemSelected={this.onAutocompleteItemSelected}
          onValueChanged={this.onCoAuthorsValueChanged}
          onKeyDown={this.onInputKeyDown}
          onFocus={this.onInputFocus}
        />
      </div>
    )
  }

  private onAuthorKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'ArrowLeft') {
      this.focusPreviousAuthor()
    } else if (event.key === 'ArrowRight') {
      this.focusNextAuthor()
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      this.removeAuthor(this.state.focusedAuthorIndex)
    }
  }

  private removeAuthor(index: number) {
    const { authors } = this.props

    if (index >= 0 && index < authors.length) {
      const newAuthors = authors
        .slice(0, index)
        .concat(authors.slice(index + 1))
      this.props.onAuthorsUpdated(newAuthors)
    }
  }

  private focusPreviousAuthor() {
    const { focusedAuthorIndex } = this.state
    const { authors } = this.props

    if (focusedAuthorIndex === -1) {
      this.focusAuthorHandle(authors.length - 1)
    } else if (focusedAuthorIndex > 0) {
      this.focusAuthorHandle(focusedAuthorIndex - 1)
    }
  }

  private focusNextAuthor() {
    const { focusedAuthorIndex } = this.state
    const { authors } = this.props

    if (focusedAuthorIndex < authors.length - 1) {
      this.focusAuthorHandle(focusedAuthorIndex + 1)
    } else {
      this.focusAuthorHandle(-1)
    }
  }

  private onInputFocus = () => {
    this.setState({ focusedAuthorIndex: -1 })
  }

  private onCoAuthorsValueChanged = (value: string) => {
    // Set the value to the shadow input div and then measure its width
    // to set the width of the input field.
    if (
      this.shadowInputRef.current === null ||
      this.inputRef === null ||
      this.inputRef.parentElement === null ||
      this.inputRef.parentElement.parentElement === null
    ) {
      return
    }
    this.shadowInputRef.current.textContent = value
    const valueWidth = this.shadowInputRef.current.clientWidth
    this.shadowInputRef.current.textContent = this.inputRef.placeholder
    const placeholderWidth = this.shadowInputRef.current.clientWidth

    const inputParent = this.inputRef.parentElement
    const inputGrandparent = this.inputRef.parentElement.parentElement

    inputParent.style.minWidth = `${Math.min(
      inputGrandparent.getBoundingClientRect().width - 10,
      Math.max(valueWidth, placeholderWidth)
    )}px`
  }

  private onInputRef = (input: HTMLInputElement | null) => {
    if (input === null) {
      return
    }

    this.inputRef = input
  }

  private onAutocompleteItemSelected = (item: UserHit) => {
    if (item.kind !== 'known-user') {
      return
    }

    this.props.onAuthorsUpdated([
      ...this.props.authors,
      authorFromUserHit(item),
    ])

    if (this.inputRef !== null) {
      this.inputRef.value = ''
      this.onCoAuthorsValueChanged('')
    }
  }

  private renderAuthors() {
    const { focusedAuthorIndex } = this.state
    return (
      <div className="added-author-container" ref={this.authorContainerRef}>
        {this.props.authors.map((author, index) => {
          return (
            <div
              key={index}
              className={classNames('handle', {
                focused: index === focusedAuthorIndex,
              })}
              aria-label={`@${author.username} press backspace or delete to remove`}
              role="option"
              aria-selected={index === focusedAuthorIndex}
              onKeyDown={this.onAuthorKeyDown}
              onClick={this.onAuthorClick}
              tabIndex={-1}
            >
              @{author.username}
            </div>
          )
        })}
      </div>
    )
  }

  private onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (this.inputRef === null) {
      return
    }

    if (event.key === 'Backspace' && this.inputRef.selectionStart === 0) {
      this.props.onAuthorsUpdated(
        this.props.authors.slice(0, this.props.authors.length - 1)
      )
    }

    if (event.key === 'ArrowLeft' && this.inputRef.selectionStart === 0) {
      this.focusPreviousAuthor()
    }
  }

  private focusAuthorHandle(index: number) {
    if (index === -1) {
      this.inputRef?.focus()
    } else {
      const handle = this.authorContainerRef.current?.getElementsByClassName(
        'handle'
      )[index] as HTMLElement | null

      handle?.focus()
    }

    this.setState({ focusedAuthorIndex: index })
  }

  private onAuthorClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const handle = event.target as HTMLElement
    const index = Array.from(handle.parentElement?.children ?? []).indexOf(
      handle
    )
    this.focusAuthorHandle(index)
  }
}
