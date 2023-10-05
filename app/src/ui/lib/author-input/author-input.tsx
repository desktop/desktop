import * as React from 'react'
import classNames from 'classnames'
import {
  UserAutocompletionProvider,
  AutocompletingInput,
  UserHit,
  KnownUserHit,
} from '../../autocompletion'
import {
  Author,
  isKnownAuthor,
  KnownAuthor,
  UnknownAuthor,
} from '../../../models/author'
import { getLegacyStealthEmailForUser } from '../../../lib/email'
import memoizeOne from 'memoize-one'
import { FocusContainer } from '../focus-container'
import { AuthorHandle } from './author-handle'
import { getFullTextForAuthor } from './author-text'

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
  readonly authors: ReadonlyArray<Author>

  /**
   * A method called when authors has been added or removed from the
   * input field.
   */
  readonly onAuthorsUpdated: (authors: ReadonlyArray<Author>) => void

  /**
   * Whether or not the input should be read-only and styled as being disabled.
   */
  readonly readOnly: boolean
}

interface IAuthorInputState {
  /** Whether or not the focus is within this component */
  readonly isFocusedWithin: boolean

  /** Index of the added author currently focused */
  readonly focusedAuthorIndex: number | null

  /** Last action description to be announced by screen readers */
  readonly lastActionDescription: string | null
}

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

/**
 * Convert a IUserHit object which is returned from
 * user-autocomplete-provider into a KnownAuthor object.
 *
 * If the IUserHit object lacks an email address we'll
 * attempt to create a stealth email address.
 */
function authorFromUserHit(user: KnownUserHit): KnownAuthor {
  return {
    kind: 'known',
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
  private autocompletingInputRef =
    React.createRef<AutocompletingInput<UserHit>>()
  private shadowInputRef = React.createRef<HTMLDivElement>()
  private inputRef: HTMLInputElement | null = null
  private authorContainerRef = React.createRef<HTMLDivElement>()

  private getAutocompleteItemFilter = memoizeOne(
    (authors: ReadonlyArray<Author>) => (item: UserHit) => {
      if (item.kind !== 'known-user') {
        return true
      }

      const usernames = authors.map(a => a.username)

      return !usernames.some(u => u === item.username)
    }
  )

  public constructor(props: IAuthorInputProps) {
    super(props)

    this.state = {
      isFocusedWithin: false,
      focusedAuthorIndex: null,
      lastActionDescription: null,
    }
  }

  public componentDidUpdate(
    prevProps: IAuthorInputProps,
    prevState: IAuthorInputState
  ) {
    // If the focus is inside of the component and _something_ changed that
    // could affect the focus, make sure the focus is still where it should
    if (
      this.state.isFocusedWithin &&
      (prevProps.authors.length !== this.props.authors.length ||
        prevState.focusedAuthorIndex !== this.state.focusedAuthorIndex)
    ) {
      this.focusAuthorHandle(this.state.focusedAuthorIndex)
    }
  }

  public focus() {
    this.autocompletingInputRef.current?.focus()
  }

  private focusAuthorHandle(index: number | null) {
    if (index === null) {
      this.inputRef?.focus()
      return
    }

    const handle = this.authorContainerRef.current?.getElementsByClassName(
      'handle'
    )[index] as HTMLElement | null
    handle?.focus()
  }

  public render() {
    const className = classNames(
      'author-input-component',
      this.props.className,
      {
        disabled: this.props.readOnly,
      }
    )

    return (
      <FocusContainer
        className={className}
        onFocusWithinChanged={this.onFocusWithinChanged}
      >
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {this.state.lastActionDescription}
        </div>
        <div className="shadow-input" ref={this.shadowInputRef} />
        <label id="author-input-label" className="label" htmlFor="author-input">
          Co-Authors&nbsp;
        </label>
        {this.renderAuthors()}
        <AutocompletingInput<UserHit>
          elementId="author-input"
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
          readOnly={this.props.readOnly}
        />
      </FocusContainer>
    )
  }

  private renderAuthors() {
    return (
      <div
        className="added-author-container"
        ref={this.authorContainerRef}
        aria-labelledby="author-input-label"
        role="listbox"
      >
        {this.props.authors.map((author, index) => {
          return this.renderAuthor(author, index)
        })}
      </div>
    )
  }

  private renderAuthor(author: Author, index: number) {
    const { focusedAuthorIndex, isFocusedWithin } = this.state

    return (
      <AuthorHandle
        key={
          isKnownAuthor(author) ? getFullTextForAuthor(author) : author.username
        }
        index={index}
        author={author}
        isFocusWithinContainer={isFocusedWithin}
        isFocused={focusedAuthorIndex === index}
        isLastAuthor={index === this.props.authors.length - 1}
        isFirstAuthor={index === 0}
        isInputFocused={focusedAuthorIndex === null}
        onKeyDown={this.onAuthorKeyDown}
        onHandleClick={this.onAuthorClick}
        onRemoveClick={this.onRemoveAuthorClick}
        onFocus={this.onAuthorFocus}
      />
    )
  }
  private onFocusWithinChanged = (isFocusedWithin: boolean) => {
    const focusedAuthorIndex = isFocusedWithin
      ? this.state.focusedAuthorIndex
      : null
    this.setState({ focusedAuthorIndex, isFocusedWithin })
  }

  private onAuthorKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLElement>
  ) => {
    if (event.key === 'ArrowLeft') {
      this.focusPreviousAuthor()
    } else if (event.key === 'ArrowRight') {
      this.focusNextAuthor()
    } else if (
      this.state.focusedAuthorIndex !== null &&
      (event.key === 'Backspace' || event.key === 'Delete')
    ) {
      this.removeAuthor(
        this.state.focusedAuthorIndex,
        event.key === 'Backspace' ? 'back' : 'forward'
      )
    }
  }

  private removeAuthor(index: number, direction: 'back' | 'forward' | 'none') {
    const { authors } = this.props

    if (index >= authors.length) {
      return
    }

    const authorToRemove = authors[index]
    const newAuthors = authors.slice(0, index).concat(authors.slice(index + 1))
    let newFocusedAuthorIndex: number | null = null

    // Focus next author depending on the "direction" of the removal:
    // - if we're using backspace, move to the previous author
    // - if we're using delete, move to the next author (which means staying
    //   on the same index)
    if (newAuthors.length > 0) {
      if (direction === 'back') {
        newFocusedAuthorIndex = Math.max(0, index - 1)
      } else {
        newFocusedAuthorIndex =
          index === authors.length - 1
            ? null
            : Math.min(newAuthors.length - 1, index)
      }
    }

    let actionDescription = `Removed ${authorToRemove.username}`
    if (isKnownAuthor(authorToRemove)) {
      actionDescription += ` (${authorToRemove.name})`
    }

    this.setState({
      focusedAuthorIndex: newFocusedAuthorIndex,
      lastActionDescription: actionDescription,
    })

    this.emitAuthorsUpdated(newAuthors)
  }

  private emitAuthorsUpdated(addedAuthors: ReadonlyArray<Author>) {
    this.props.onAuthorsUpdated(addedAuthors)
  }

  private focusPreviousAuthor() {
    const { focusedAuthorIndex } = this.state
    const { authors } = this.props

    if (focusedAuthorIndex === null) {
      this.setState({ focusedAuthorIndex: authors.length - 1 })
    } else if (focusedAuthorIndex > 0) {
      this.setState({ focusedAuthorIndex: focusedAuthorIndex - 1 })
    }
  }

  private focusNextAuthor() {
    const { focusedAuthorIndex } = this.state
    const { authors } = this.props

    if (
      focusedAuthorIndex !== null &&
      focusedAuthorIndex < authors.length - 1
    ) {
      this.setState({ focusedAuthorIndex: focusedAuthorIndex + 1 })
    } else {
      this.setState({ focusedAuthorIndex: null })
    }
  }

  private onInputFocus = () => {
    this.setState({
      focusedAuthorIndex: null,
    })
  }

  private onCoAuthorsValueChanged = (value: string) => {
    if (
      this.shadowInputRef.current === null ||
      this.inputRef === null ||
      this.inputRef.parentElement === null ||
      this.inputRef.parentElement.parentElement === null
    ) {
      return
    }

    // HACK: input elements don't behave as expected when we want them to fit
    // to their content, and expand if there is enough space. They take more
    // space than needed.
    // This HACK uses a "shadow" (invisible) element with same styles as the
    // input element to calculate the width of the input element based on its
    // content.
    // We will also take into account the width of the ancestors' width to make
    // the input element expand as much as possible without overflowing.

    this.shadowInputRef.current.textContent = value
    const valueWidth = this.shadowInputRef.current.clientWidth
    this.shadowInputRef.current.textContent = this.inputRef.placeholder
    const placeholderWidth = this.shadowInputRef.current.clientWidth

    const inputParent = this.inputRef.parentElement
    const inputGrandparent = this.inputRef.parentElement.parentElement

    const grandparentPadding = 10
    inputParent.style.minWidth = `${Math.min(
      inputGrandparent.getBoundingClientRect().width - grandparentPadding,
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
    const authorToAdd: Author =
      item.kind === 'known-user'
        ? authorFromUserHit(item)
        : {
            kind: 'unknown',
            username: item.username,
            state: 'searching',
          }

    const newAuthors = [...this.props.authors, authorToAdd]
    this.emitAuthorsUpdated(newAuthors)

    let actionDescription = `Added ${authorToAdd.username}`
    if (!isKnownAuthor(authorToAdd)) {
      this.attemptUnknownAuthorSearch(authorToAdd)
    } else {
      actionDescription += ` (${authorToAdd.name})`
    }

    this.setState({ lastActionDescription: actionDescription })

    if (this.inputRef !== null) {
      this.inputRef.value = ''
      this.onCoAuthorsValueChanged('')
    }
  }

  private async attemptUnknownAuthorSearch(author: UnknownAuthor) {
    const knownAuthor = this.props.authors
      .filter(isKnownAuthor)
      .find(a => a.username?.toLowerCase() === author.username.toLowerCase())

    if (knownAuthor !== undefined) {
      this.updateUnknownAuthor(knownAuthor)
      return
    }

    const hit = await this.props.autoCompleteProvider.exactMatch(
      author.username
    )

    if (hit === null || hit.kind !== 'known-user') {
      const erroredUnknownAuthor: UnknownAuthor = {
        ...author,
        state: 'error',
      }

      this.updateUnknownAuthor(erroredUnknownAuthor)
      this.setState({
        lastActionDescription: `Error: user ${author.username} not found`,
      })
      return
    }

    const hitAuthor = authorFromUserHit(hit)
    this.updateUnknownAuthor(hitAuthor)
  }

  private updateUnknownAuthor(author: Author) {
    const newAuthors = this.props.authors.map(a =>
      a.username?.toLowerCase() === author.username?.toLowerCase() &&
      !isKnownAuthor(a)
        ? author
        : a
    )

    this.emitAuthorsUpdated(newAuthors)
  }

  private onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (this.inputRef === null) {
      return
    }

    if (
      (event.key === 'ArrowLeft' || event.key === 'Backspace') &&
      this.inputRef.selectionStart === 0
    ) {
      this.focusPreviousAuthor()
    }

    // If Space is pressed at the end of the text, attempt to autocomplete
    if (
      event.key === ' ' &&
      this.inputRef.selectionStart === this.inputRef.value.length
    ) {
      event.preventDefault()

      const value = this.inputRef.value.trim()
      if (value.length !== 0) {
        this.onAutocompleteItemSelected({
          kind: 'unknown-user',
          username: value,
        })
      }
    }
  }

  private onAuthorClick = (index: number) => {
    this.setState({ focusedAuthorIndex: index })
  }

  private onRemoveAuthorClick = (index: number) => {
    this.removeAuthor(index, 'forward')
  }

  private onAuthorFocus = (index: number) => {
    this.setState({ focusedAuthorIndex: index })
  }
}
