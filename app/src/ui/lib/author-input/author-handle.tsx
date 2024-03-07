import classNames from 'classnames'
import React from 'react'
import { Author, isKnownAuthor } from '../../../models/author'
import { Octicon, syncClockwise } from '../../octicons'
import * as octicons from '../../octicons/octicons.generated'
import { getFullTextForAuthor, getDisplayTextForAuthor } from './author-text'

interface IAuthorHandleProps {
  /** Author to render */
  readonly author: Author

  /** Index of the author in the list of added authors */
  readonly index: number

  /** Whether the author is focused */
  readonly isFocused: boolean

  /** Whether the author is the last author in the list of added authors */
  readonly isLastAuthor: boolean

  /** Whether the author is the first author in the list of added authors */
  readonly isFirstAuthor: boolean

  /** Whether the container element has the focus within it */
  readonly isFocusWithinContainer: boolean

  /** Whether the input element has the focus */
  readonly isInputFocused: boolean

  /** Callback to invoke when the user presses a key */
  readonly onKeyDown: (
    index: number,
    event: React.KeyboardEvent<HTMLElement>
  ) => void

  /** Callback to invoke when the user clicks on the author */
  readonly onHandleClick: (
    index: number,
    event: React.MouseEvent<HTMLElement>
  ) => void

  /** Callback to invoke when the user clicks on the remove button */
  readonly onRemoveClick: (
    index: number,
    event: React.MouseEvent<HTMLElement>
  ) => void

  /** Callback to invoke when the user focuses on the author */
  readonly onFocus: (
    index: number,
    event: React.FocusEvent<HTMLElement>
  ) => void
}

export class AuthorHandle extends React.Component<IAuthorHandleProps> {
  private getAriaLabel() {
    const { author } = this.props
    if (isKnownAuthor(author)) {
      return `${getFullTextForAuthor(
        author
      )} press backspace or delete to remove`
    }

    const isError = author.state === 'error'
    const stateAriaLabel = isError ? 'user not found' : 'searching'
    return `${author.username}, ${stateAriaLabel}, press backspace or delete to remove`
  }

  private getClassName() {
    const { author, isFocused } = this.props
    const classNamesArr: Array<any> = ['handle', { focused: isFocused }]
    if (!isKnownAuthor(author)) {
      const isError = author.state === 'error'
      classNamesArr.push({ progress: !isError, error: isError })
    }
    return classNames(classNamesArr)
  }

  private getTitle() {
    const { author } = this.props

    if (isKnownAuthor(author)) {
      return undefined
    }

    return author.state === 'error'
      ? `Could not find user with username ${author.username}`
      : `Searching for @${author.username}`
  }

  private getTabIndex() {
    const {
      isFocusWithinContainer,
      isFocused,
      isLastAuthor,
      isFirstAuthor,
      isInputFocused,
    } = this.props
    // If the component is not focused, then only the first author should be
    // focusable
    if (!isFocusWithinContainer) {
      return isFirstAuthor ? 0 : -1
    }

    // If the author is focused already, then it should be focusable
    if (isFocused) {
      return 0
    }

    // Otherwise, if the input is focused, then only the last author should be
    // focusable in order to leave the input with shift+tab
    return isLastAuthor && isInputFocused ? 0 : -1
  }

  public render() {
    const { author, isFocused } = this.props

    return (
      // eslint-disable-next-line github/a11y-no-title-attribute
      <div
        className={this.getClassName()}
        title={this.getTitle()}
        role="option"
        aria-label={this.getAriaLabel()}
        aria-selected={isFocused}
        onKeyDown={this.onKeyDown}
        onClick={this.onHandleClick}
        tabIndex={this.getTabIndex()}
        onFocus={this.onFocus}
      >
        <span aria-hidden="true">{getDisplayTextForAuthor(author)}</span>
        {!isKnownAuthor(author) && (
          <Octicon
            className={classNames('icon', { spin: author.state !== 'error' })}
            symbol={author.state === 'error' ? octicons.stop : syncClockwise}
          />
        )}
        <button onClick={this.onRemoveClick} tabIndex={-1}>
          <Octicon className="delete" symbol={octicons.x} />
        </button>
      </div>
    )
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    this.props.onKeyDown(this.props.index, event)
  }

  private onRemoveClick = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault()
    this.props.onRemoveClick(this.props.index, event)
  }

  private onHandleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (event.isDefaultPrevented()) {
      return
    }

    this.props.onHandleClick(this.props.index, event)
  }

  private onFocus = (event: React.FocusEvent<HTMLElement>) => {
    this.props.onFocus(this.props.index, event)
  }
}
