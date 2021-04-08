import * as React from 'react'
import CodeMirror, {
  Editor,
  EditorConfiguration,
  Doc,
  Position,
  TextMarkerOptions,
} from 'codemirror'
import classNames from 'classnames'
import { UserAutocompletionProvider, IUserHit } from '../autocompletion'
import { compare } from '../../lib/compare'
import { arrayEquals } from '../../lib/equality'
import { OcticonSymbol, syncClockwise } from '../octicons'
import { IAuthor } from '../../models/author'
import { showContextualMenu } from '../main-process-proxy'
import { IMenuItem } from '../../lib/menu-item'
import { getLegacyStealthEmailForUser } from '../../lib/email'

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
 * Return the position previous to (i.e before) the given
 * position in a codemirror doc
 */
function prevPosition(doc: Doc, pos: Position) {
  return doc.posFromIndex(doc.indexFromPos(pos) - 1)
}

/**
 * Return the position next to (i.e after) the given
 * position in a codemirror doc
 */
function nextPosition(doc: Doc, pos: Position) {
  return doc.posFromIndex(doc.indexFromPos(pos) + 1)
}

/**
 * Gets a value indicating whether the given position is
 * _inside_ of an existing marker. Note that marker ranges
 * are inclusive and this method takes that into account.
 */
function posIsInsideMarkedText(doc: Doc, pos: Position) {
  const marks = (doc.findMarksAt(pos) as any) as ActualTextMarker[]
  const ix = doc.indexFromPos(pos)

  return marks.some(mark => {
    const markPos = mark.find()

    // This shouldn't ever happen since we just pulled them
    // from the doc
    if (!markPos) {
      return false
    }

    const from = doc.indexFromPos(markPos.from)
    const to = doc.indexFromPos(markPos.to)

    return ix > from && ix < to
  })
}

function isMarkOrWhitespace(doc: Doc, pos: Position) {
  const line = doc.getLine(pos.line)
  if (/\s/.test(line.charAt(pos.ch))) {
    return true
  }

  return posIsInsideMarkedText(doc, pos)
}

function posEquals(x: Position, y: Position) {
  return x.line === y.line && x.ch === y.ch
}

/**
 * Scan through the doc, starting at the given start position and
 * moving using the iter function for as long as the predicate is
 * true or the iterator function fails to update the position (i.e
 * at the start or end of the document)
 *
 * @param doc       The codemirror document to scan through
 *
 * @param start     The initial position, note that this position is
 *                  not inclusive, i.e. the predicate will not be
 *                  called for the initial position
 *
 * @param predicate A function called with each position returned
 *                  from the iter function that determines whether
 *                  or not to keep scanning through the document.
 *
 *                  If the predicate returns true this function will
 *                  keep iterating.
 *
 * @param iter      A function that, given either the start position
 *                  or a position returned from the previous iter
 *                  call, returns the next position to scan.
 */
function scanWhile(
  doc: Doc,
  start: Position,
  predicate: (doc: Doc, pos: Position) => boolean,
  iter: (doc: Doc, pos: Position) => Position
) {
  let pos = start

  for (
    let next = iter(doc, start);
    predicate(doc, next) && !posEquals(pos, next);
    next = iter(doc, next)
  ) {
    pos = next
  }

  return pos
}

/**
 * Scan through the doc, starting at the given start position and
 * moving using the iter function until the predicate returns
 * true or the iterator function fails to update the position (i.e
 * at the start or end of the document)
 *
 * @param doc       The codemirror document to scan through
 *
 * @param start     The initial position, note that this position is
 *                  not inclusive, i.e. the predicate will not be
 *                  called for the initial position
 *
 * @param predicate A function called with each position returned
 *                  from the iter function that determines whether
 *                  or not to keep scanning through the document.
 *
 *                  If the predicate returns false this function will
 *                  keep iterating.
 *
 * @param iter      A function that, given either the start position
 *                  or a position returned from the previous iter
 *                  call, returns the next position to scan.
 */
function scanUntil(
  doc: Doc,
  start: Position,
  predicate: (doc: Doc, pos: Position) => boolean,
  iter: (doc: Doc, pos: Position) => Position
): Position {
  return scanWhile(doc, start, (doc, pos) => !predicate(doc, pos), iter)
}

function appendTextMarker(
  cm: Editor,
  text: string,
  options: TextMarkerOptions
): ActualTextMarker {
  const doc = cm.getDoc()
  const from = doc.posFromIndex(Infinity)

  doc.replaceRange(text, from)
  const to = doc.posFromIndex(Infinity)

  return (doc.markText(from, to, options) as any) as ActualTextMarker
}

/**
 * Comparison method for use in sorting lists of markers in ascending
 * order of start positions.
 */
function orderByPosition(x: ActualTextMarker, y: ActualTextMarker) {
  const xPos = x.find()
  const yPos = y.find()

  if (xPos === undefined || yPos === undefined) {
    return compare(xPos, yPos)
  }

  return compare(xPos.from, yPos.from)
}

// The types for CodeMirror.TextMarker is all wrong, this is what it
// actually looks like
// eslint-disable-next-line @typescript-eslint/naming-convention
interface ActualTextMarker extends TextMarkerOptions {
  /** Remove the mark. */
  clear(): void

  /**
   * Returns a {from, to} object (both holding document positions), indicating
   * the current position of the marked range, or undefined if the marker is
   * no longer in the document.
   */
  find(): { from: Position; to: Position } | undefined

  changed(): void
}

function renderUnknownUserAutocompleteItem(
  elem: HTMLElement,
  self: any,
  data: any
) {
  const text = data.username as string
  const user = document.createElement('div')
  user.classList.add('user', 'unknown')

  const username = document.createElement('span')
  username.className = 'username'
  username.innerText = text
  user.appendChild(username)

  const description = document.createElement('span')
  description.className = 'description'
  description.innerText = `Search for user`
  user.appendChild(description)

  elem.appendChild(user)
}

function renderUserAutocompleteItem(elem: HTMLElement, self: any, data: any) {
  const author = data.author as IAuthor
  const user = document.createElement('div')
  user.className = 'user'

  // This will always be non-null when we get it from the
  // autocompletion provider but let's be extra cautious
  if (author.username) {
    const username = document.createElement('span')
    username.className = 'username'
    username.innerText = author.username
    user.appendChild(username)
  }

  const name = document.createElement('span')
  name.className = 'name'
  name.innerText = author.name

  user.appendChild(name)
  elem.appendChild(user)
}

/**
 * Returns an email address which can be used on the host side to
 * look up the user which is to be given attribution.
 *
 * If the user has a public email address specified in their profile
 * that's used and if they don't then we'll generate a stealth email
 * address.
 */
function getEmailAddressForUser(user: IUserHit) {
  return user.email && user.email.length > 0
    ? user.email
    : getLegacyStealthEmailForUser(user.username, user.endpoint)
}

function getDisplayTextForAuthor(author: IAuthor) {
  return author.username === null ? author.name : `@${author.username}`
}

function renderHandleMarkReplacementElement(author: IAuthor) {
  const elem = document.createElement('span')
  elem.classList.add('handle')
  elem.title = `${author.name} <${author.email}>`
  elem.innerText = getDisplayTextForAuthor(author)

  return elem
}

function renderUnknownHandleMarkReplacementElement(
  username: string,
  isError: boolean
) {
  const elem = document.createElement('span')

  elem.classList.add('handle', isError ? 'error' : 'progress')
  elem.title = isError
    ? `Could not find user with username ${username}`
    : `Searching for @${username}`

  const symbol = isError ? OcticonSymbol.stop : syncClockwise

  const spinner = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  spinner.classList.add('icon')

  if (!isError) {
    spinner.classList.add('spin')
  }

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')

  spinner.viewBox.baseVal.width = symbol.w
  spinner.viewBox.baseVal.height = symbol.h

  path.setAttribute('d', symbol.d)
  spinner.appendChild(path)

  elem.appendChild(document.createTextNode(`@${username}`))
  elem.appendChild(spinner)

  return elem
}

function markRangeAsHandle(
  doc: Doc,
  from: Position,
  to: Position,
  author: IAuthor
): ActualTextMarker {
  const elem = renderHandleMarkReplacementElement(author)

  return (doc.markText(from, to, {
    atomic: true,
    className: 'handle',
    readOnly: false,
    replacedWith: elem,
    handleMouseEvents: true,
  }) as any) as ActualTextMarker
}

function triggerAutoCompleteBasedOnCursorPosition(cm: Editor) {
  const doc = cm.getDoc()

  if (doc.somethingSelected()) {
    return
  }

  const cursor = doc.getCursor()
  const p = scanUntil(doc, cursor, isMarkOrWhitespace, prevPosition)

  if (posEquals(cursor, p)) {
    return
  }

  ;(cm as any).showHint()
}

/**
 * Convert a IUserHit object which is returned from
 * user-autocomplete-provider into an IAuthor object.
 *
 * If the IUserHit object lacks an email address we'll
 * attempt to create a stealth email address.
 */
function authorFromUserHit(user: IUserHit): IAuthor {
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
export class AuthorInput extends React.Component<IAuthorInputProps, {}> {
  /**
   * The codemirror instance if mounted, otherwise null
   */
  private editor: Editor | null = null

  /**
   * Resize observer used for tracking width changes and
   * refreshing the internal codemirror instance when
   * they occur
   */
  private readonly resizeObserver: ResizeObserver
  private resizeDebounceId: number | null = null
  private lastKnownWidth: number | null = null

  /**
   * Whether or not the hint (i.e. autocompleter)
   * is currently active.
   */
  private hintActive: boolean = false

  /**
   * A reference to the label mark (the persistent
   * part of the placeholder text)
   */
  private label: ActualTextMarker | null = null

  /**
   * A reference to the placeholder mark (the second
   * part of the placeholder text which is collapsed
   * when there's user input)
   */
  private placeholder: ActualTextMarker | null = null

  /**
   * The internal list of authors. Note that codemirror
   * ultimately is the source of truth for what authors
   * are in here but we synchronize that into this field
   * whenever codemirror reports a change. We also use
   * this array to detect whether the author props have
   * change, in which case we blow away everything and
   * start from scratch.
   */
  private authors: ReadonlyArray<IAuthor> = []

  // For undo association
  private readonly markAuthorMap = new Map<ActualTextMarker, IAuthor>()
  private readonly authorMarkMap = new Map<IAuthor, ActualTextMarker>()

  public constructor(props: IAuthorInputProps) {
    super(props)

    // Observe size changes and let codemirror know
    // when it needs to refresh.
    this.resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 1 && this.editor) {
        const newWidth = entries[0].contentRect.width

        // We don't care about the first resize, let's just
        // store what we've got
        if (!this.lastKnownWidth) {
          this.lastKnownWidth = newWidth
          return
        }

        // Codemirror already does a good job of height changes,
        // we just need to care about when the width changes and
        // do a re-layout
        if (this.lastKnownWidth !== newWidth) {
          this.lastKnownWidth = newWidth

          if (this.resizeDebounceId !== null) {
            cancelAnimationFrame(this.resizeDebounceId)
            this.resizeDebounceId = null
          }
          this.resizeDebounceId = requestAnimationFrame(this.onResized)
        }
      }
    })

    this.state = {}
  }

  public focus() {
    this.editor?.focus()
  }

  public componentWillUnmount() {
    // Sometimes the completion box seems to fail to register
    // the blur event and close. It's hard to reproduce so
    // we'll just make doubly sure it's closed when we're
    // about to go away.
    if (this.editor) {
      const state = this.editor.state
      if (state.completionActive && state.completionActive.close) {
        state.completionActive.close()
      }
    }
  }

  public componentWillReceiveProps(nextProps: IAuthorInputProps) {
    const cm = this.editor

    if (!cm) {
      return
    }

    // If the authors prop have changed from our internal representation
    // we'll throw up our hands and reset the input to whatever we're
    // given.
    if (
      nextProps.authors !== this.props.authors &&
      !arrayEquals(this.authors, nextProps.authors)
    ) {
      cm.operation(() => {
        this.reset(cm, nextProps.authors)
      })
    }

    if (nextProps.disabled !== this.props.disabled) {
      cm.setOption('readOnly', nextProps.disabled ? 'nocursor' : false)
    }
  }

  private onResized = () => {
    this.resizeDebounceId = null
    if (this.editor) {
      this.editor.refresh()
    }
  }

  private onContainerRef = (elem: HTMLDivElement) => {
    if (elem) {
      this.editor = this.initializeCodeMirror(elem)
      this.resizeObserver.observe(elem)
    } else {
      this.editor = null
      this.resizeObserver.disconnect()
    }
  }

  private applyCompletion = (cm: Editor, data: any, completion: any) => {
    const from: Position = completion.from || data.from
    const to: Position = completion.to || data.to
    const author: IAuthor = completion.author

    this.insertAuthor(cm, author, from, to)
    this.updateAuthors(cm)
  }

  private applyUnknownUserCompletion = (
    cm: Editor,
    data: any,
    completion: any
  ) => {
    const from: Position = completion.from || data.from
    const to: Position = completion.to || data.to
    const username: string = completion.username
    const text = `@${username}`
    const doc = cm.getDoc()

    doc.replaceRange(text, from, to, 'complete')
    const end = doc.posFromIndex(doc.indexFromPos(from) + text.length)

    // Create a temporary, atomic, marker so that the text can't be modified.
    // This marker will be styled in such a way as to indicate that it's
    // processing.
    const tmpMark = (doc.markText(from, end, {
      atomic: true,
      className: 'handle progress',
      readOnly: false,
      replacedWith: renderUnknownHandleMarkReplacementElement(username, false),
      handleMouseEvents: true,
    }) as any) as ActualTextMarker

    // Note that it's important that this method isn't async up until
    // this point since show-hint expects a synchronous method
    return this.props.autoCompleteProvider.exactMatch(username).then(hit => {
      cm.operation(() => {
        const tmpPos = tmpMark.find()

        // Since we're async here it's possible that the user has deleted
        // the temporary mark already, in which case we just bail.
        if (!tmpPos) {
          return
        }

        // Clear out the temporary mark and get ready to either replace
        // it with a proper handle marker or an error marker.
        tmpMark.clear()

        if (!hit) {
          doc.markText(tmpPos.from, tmpPos.to, {
            atomic: true,
            className: 'handle error',
            readOnly: false,
            replacedWith: renderUnknownHandleMarkReplacementElement(
              username,
              true
            ),
            handleMouseEvents: true,
          })

          return
        }

        this.insertAuthor(cm, authorFromUserHit(hit), tmpPos.from, tmpPos.to)
      })
    })
  }

  private insertAuthor(
    cm: Editor,
    author: IAuthor,
    from: Position,
    to?: Position
  ) {
    const text = getDisplayTextForAuthor(author)
    const doc = cm.getDoc()

    doc.replaceRange(text, from, to, 'complete')

    const end = doc.posFromIndex(doc.indexFromPos(from) + text.length)
    const marker = markRangeAsHandle(doc, from, end, author)

    this.markAuthorMap.set(marker, author)
    this.authorMarkMap.set(author, marker)

    return marker
  }

  private appendAuthor(cm: Editor, author: IAuthor) {
    const doc = cm.getDoc()
    return this.insertAuthor(cm, author, doc.posFromIndex(Infinity))
  }

  private onAutocompleteUser = async (cm: Editor, x?: any, y?: any) => {
    const doc = cm.getDoc()
    const cursor = doc.getCursor() as Readonly<Position>

    // expand the current cursor position into a range covering as
    // long of an autocompletable string as possible.
    const from = scanUntil(doc, cursor, isMarkOrWhitespace, prevPosition)
    const to = scanUntil(doc, cursor, isMarkOrWhitespace, nextPosition)

    const word = doc.getRange(from, to)

    const needle = word.replace(/^@/, '')
    const hits = await this.props.autoCompleteProvider.getAutocompletionItems(
      needle
    )

    const exactMatch = hits.some(
      hit => hit.username.toLowerCase() === needle.toLowerCase()
    )

    const existingUsernames = new Set(this.authors.map(x => x.username))

    const list: any[] = hits
      .map(authorFromUserHit)
      .filter(x => x.username === null || !existingUsernames.has(x.username))
      .map(author => ({
        author,
        text: getDisplayTextForAuthor(author),
        render: renderUserAutocompleteItem,
        className: 'autocompletion-item',
        hint: this.applyCompletion,
      }))

    if (!exactMatch && needle.length > 0) {
      list.push({
        text: `@${needle}`,
        username: needle,
        render: renderUnknownUserAutocompleteItem,
        className: 'autocompletion-item',
        hint: this.applyUnknownUserCompletion,
      })
    }

    return { list, from, to }
  }

  private updatePlaceholderVisibility(cm: Editor) {
    if (this.label && this.placeholder) {
      const labelRange = this.label.find()
      const placeholderRange = this.placeholder.find()

      // If this happen then codemirror has done something
      // weird. It shouldn't be possible to remove these
      // markers from the document.
      if (!labelRange || !placeholderRange) {
        return
      }

      const doc = cm.getDoc()

      const collapse =
        doc.indexFromPos(labelRange.to) !==
        doc.indexFromPos(placeholderRange.from)

      if (this.placeholder.collapsed !== collapse) {
        this.placeholder.collapsed = collapse
        this.placeholder.changed()
      }
    }
  }

  private getAllHandleMarks(cm: Editor): Array<ActualTextMarker> {
    return (cm.getDoc().getAllMarks() as any) as ActualTextMarker[]
  }

  private initializeCodeMirror(host: HTMLDivElement) {
    const CodeMirrorOptions: EditorConfiguration & {
      hintOptions: any
    } = {
      mode: null,
      lineWrapping: true,
      extraKeys: {
        Tab: false,
        Enter: false,
        'Shift-Tab': false,
        'Ctrl-Space': 'autocomplete',
        'Ctrl-Enter': false,
        'Cmd-Enter': false,
        // Disable all search-related shortcuts.
        [__DARWIN__ ? 'Cmd-F' : 'Ctrl-F']: false, // find
        [__DARWIN__ ? 'Cmd-G' : 'Ctrl-G']: false, // findNext
        [__DARWIN__ ? 'Shift-Cmd-G' : 'Shift-Ctrl-G']: false, // findPrev
        [__DARWIN__ ? 'Cmd-Alt-F' : 'Shift-Ctrl-F']: false, // replace
        [__DARWIN__ ? 'Shift-Cmd-Alt-F' : 'Shift-Ctrl-R']: false, // replaceAll
      },
      readOnly: this.props.disabled ? 'nocursor' : false,
      hintOptions: {
        completeOnSingleClick: true,
        completeSingle: false,
        closeOnUnfocus: true,
        closeCharacters: /\s/,
        hint: this.onAutocompleteUser,
      },
    }

    const cm = CodeMirror(host, CodeMirrorOptions)

    cm.operation(() => {
      this.reset(cm, this.props.authors)
    })

    cm.on('startCompletion', () => {
      this.hintActive = true
    })

    cm.on('endCompletion', () => {
      this.hintActive = false
    })

    cm.on('change', () => {
      this.updatePlaceholderVisibility(cm)

      if (!this.hintActive) {
        triggerAutoCompleteBasedOnCursorPosition(cm)
      }
    })

    cm.on('focus', () => {
      if (!this.hintActive) {
        triggerAutoCompleteBasedOnCursorPosition(cm)
      }
    })

    cm.on('changes', () => {
      this.updateAuthors(cm)
    })

    const wrapperElem = cm.getWrapperElement()

    // Do the very least we can do to pretend that we're a
    // single line textbox. Users can still paste newlines
    // though and if the do we don't care.
    wrapperElem.addEventListener('keypress', (e: KeyboardEvent) => {
      if (!e.defaultPrevented && e.key === 'Enter') {
        e.preventDefault()
      }
    })

    wrapperElem.addEventListener('contextmenu', e => {
      this.onContextMenu(cm, e)
    })

    return cm
  }

  private onContextMenu(cm: Editor, e: MouseEvent) {
    e.preventDefault()

    const menu: IMenuItem[] = [
      { label: 'Undo', action: () => cm.getDoc().undo() },
      { label: 'Redo', action: () => cm.getDoc().redo() },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
    ]

    if (__WIN32__) {
      menu.push({ type: 'separator' })
    }

    menu.push({
      label: __DARWIN__ ? 'Select All' : 'Select all',
      action: () => {
        cm.execCommand('selectAll')
      },
    })

    showContextualMenu(menu)
  }

  private updateAuthors(cm: Editor) {
    const markers = this.getAllHandleMarks(cm).sort(orderByPosition)
    const authors = new Array<IAuthor>()

    for (const marker of markers) {
      const author = this.markAuthorMap.get(marker)

      // undefined authors shouldn't happen lol
      if (author) {
        authors.push(author)
      }
    }

    if (!arrayEquals(this.authors, authors)) {
      this.authors = authors
      this.props.onAuthorsUpdated(authors)
    }
  }

  private reset(cm: Editor, authors: ReadonlyArray<IAuthor>) {
    const doc = cm.getDoc()

    cm.setValue('')
    doc.clearHistory()

    this.authors = []
    this.authorMarkMap.clear()
    this.markAuthorMap.clear()

    this.label = appendTextMarker(cm, 'Co-Authors ', {
      atomic: true,
      inclusiveLeft: true,
      className: 'label',
      readOnly: true,
    })

    for (const author of authors) {
      this.appendAuthor(cm, author)
    }

    this.authors = this.props.authors

    this.placeholder = appendTextMarker(cm, '@username', {
      atomic: true,
      inclusiveRight: true,
      className: 'placeholder',
      readOnly: true,
      collapsed: authors.length > 0,
    })

    // We know that find won't returned undefined here because we
    // _just_ put the placeholder in there
    doc.setCursor(this.placeholder.find()!.from)
  }

  public render() {
    const className = classNames(
      'author-input-component',
      this.props.className,
      {
        disabled: this.props.disabled,
      }
    )
    return <div className={className} ref={this.onContainerRef} />
  }
}
