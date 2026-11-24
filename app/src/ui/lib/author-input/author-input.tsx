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
import { arrayEquals } from '../../../lib/equality'

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

  /** Stable repository and host identity for asynchronous author lookups. */
  readonly authorLookupContext?: string

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
  private lastAuthorLookupID = 0
  // Retain lookup IDs until controlled props acknowledge the resolved author.
  private readonly authorLookups = new Map<UnknownAuthor, number>()
  private readonly pendingAuthorResolutions = new Map<UnknownAuthor, Author>()
  private lastEmittedAuthors: ReadonlyArray<Author> | null = null
  private pendingAuthorsUpdateBase: ReadonlyArray<Author> | null = null

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

  public componentDidMount() {
    this.resumeAuthorLookups()
  }

  public componentWillUnmount() {
    this.authorLookups.clear()
    this.pendingAuthorResolutions.clear()
    this.lastEmittedAuthors = null
    this.pendingAuthorsUpdateBase = null
  }

  public componentDidUpdate(
    prevProps: IAuthorInputProps,
    prevState: IAuthorInputState
  ) {
    if (
      prevProps.authorLookupContext !== this.props.authorLookupContext ||
      (this.props.authorLookupContext === undefined &&
        prevProps.autoCompleteProvider !== this.props.autoCompleteProvider)
    ) {
      this.authorLookups.clear()
      this.pendingAuthorResolutions.clear()
      this.lastEmittedAuthors = null
      this.pendingAuthorsUpdateBase = null
    }

    if (
      this.pendingAuthorsUpdateBase !== null &&
      !arrayEquals(this.pendingAuthorsUpdateBase, this.props.authors)
    ) {
      this.pendingAuthorsUpdateBase = null
    }

    if (prevProps.authors !== this.props.authors) {
      for (const author of this.authorLookups.keys()) {
        if (!this.props.authors.includes(author)) {
          this.authorLookups.delete(author)
        }
      }
      for (const author of this.pendingAuthorResolutions.keys()) {
        if (!this.props.authors.includes(author)) {
          this.pendingAuthorResolutions.delete(author)
        }
      }
    }
    this.resumeAuthorLookups()
    this.applyPendingAuthorResolutions()

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
        readOnly={this.props.readOnly}
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
    if (this.props.readOnly) {
      return
    }

    if (index >= this.props.authors.length) {
      return
    }

    const selectedAuthor = this.props.authors[index]
    const authors = this.authorsForUpdate
    const authorToRemove = isKnownAuthor(selectedAuthor)
      ? selectedAuthor
      : this.pendingAuthorResolutions.get(selectedAuthor) ?? selectedAuthor
    const currentIndex = authors.indexOf(authorToRemove)
    if (currentIndex < 0) {
      return
    }
    if (!isKnownAuthor(selectedAuthor)) {
      this.authorLookups.delete(selectedAuthor)
      this.pendingAuthorResolutions.delete(selectedAuthor)
    }
    const newAuthors = authors
      .slice(0, currentIndex)
      .concat(authors.slice(currentIndex + 1))
    let newFocusedAuthorIndex: number | null = null

    // Focus next author depending on the "direction" of the removal:
    // - if we're using backspace, move to the previous author
    // - if we're using delete, move to the next author (which means staying
    //   on the same index)
    if (newAuthors.length > 0) {
      if (direction === 'back') {
        newFocusedAuthorIndex = Math.max(0, currentIndex - 1)
      } else {
        newFocusedAuthorIndex =
          currentIndex === authors.length - 1
            ? null
            : Math.min(newAuthors.length - 1, currentIndex)
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
    const resolvedAuthors = this.resolvePendingAuthors(addedAuthors)
    this.pendingAuthorsUpdateBase = this.props.authors
    this.lastEmittedAuthors = resolvedAuthors
    this.props.onAuthorsUpdated(resolvedAuthors)
  }

  private get authorsForUpdate() {
    return this.pendingAuthorsUpdateBase !== null &&
      this.lastEmittedAuthors !== null &&
      arrayEquals(this.pendingAuthorsUpdateBase, this.props.authors)
      ? this.lastEmittedAuthors
      : this.props.authors
  }

  private resolvePendingAuthors(authors: ReadonlyArray<Author>) {
    return authors.map(author =>
      isKnownAuthor(author)
        ? author
        : this.pendingAuthorResolutions.get(author) ?? author
    )
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
    this.inputRef = input
  }

  private onAutocompleteItemSelected = (item: UserHit) => {
    if (this.props.readOnly) {
      return
    }

    const authorToAdd: Author =
      item.kind === 'known-user'
        ? authorFromUserHit(item)
        : {
            kind: 'unknown',
            username: item.username,
            state: 'searching',
          }

    const newAuthors = [...this.authorsForUpdate, authorToAdd]
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
    if (
      this.authorLookups.has(author) ||
      this.pendingAuthorResolutions.has(author)
    ) {
      return
    }

    const lookupID = ++this.lastAuthorLookupID
    const provider = this.props.autoCompleteProvider
    this.authorLookups.set(author, lookupID)
    const knownAuthor = this.props.authors
      .filter(isKnownAuthor)
      .find(a => a.username?.toLowerCase() === author.username.toLowerCase())

    const hit =
      knownAuthor === undefined
        ? await provider.exactMatch(author.username)
        : null
    if (
      this.authorLookups.get(author) !== lookupID ||
      this.authorContainerRef.current === null
    ) {
      return
    }

    const resolution: Author =
      knownAuthor ??
      (hit !== null && hit.kind === 'known-user'
        ? authorFromUserHit(hit)
        : { ...author, state: 'error' })
    this.pendingAuthorResolutions.set(author, resolution)
    this.applyPendingAuthorResolutions()
  }

  private resumeAuthorLookups() {
    for (const author of this.authorsForUpdate) {
      if (!isKnownAuthor(author) && author.state === 'searching') {
        this.attemptUnknownAuthorSearch(author)
      }
    }
  }

  private applyPendingAuthorResolutions() {
    if (this.props.readOnly || this.authorContainerRef.current === null) {
      return
    }

    const currentAuthors = this.authorsForUpdate
    const newAuthors = this.resolvePendingAuthors(currentAuthors)
    if (
      arrayEquals(newAuthors, currentAuthors) ||
      (this.lastEmittedAuthors !== null &&
        arrayEquals(newAuthors, this.lastEmittedAuthors))
    ) {
      return
    }
    this.emitAuthorsUpdated(newAuthors)
    const failed = newAuthors.find(
      (author, index) =>
        author !== currentAuthors[index] &&
        !isKnownAuthor(author) &&
        author.state === 'error'
    )
    if (failed !== undefined) {
      this.setState({
        lastActionDescription: `Error: user ${failed.username} not found`,
      })
    }
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
