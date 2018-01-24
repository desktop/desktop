import * as React from 'react'
import * as CodeMirror from 'codemirror'
import * as URL from 'url'
import {
  IAutocompletionProvider,
  UserAutocompletionProvider,
  IUserHit,
} from '../autocompletion'
import { Doc, Position } from 'codemirror'
import { isDotComApiEndpoint } from '../../lib/api'
import { compare } from '../../lib/compare'

export interface IAuthor {
  readonly name: string
  readonly email: string
  readonly username: string | null
}

function authorFromUserHit(user: IUserHit): IAuthor {
  return {
    name: user.name,
    email: getEmailAddressForUser(user),
    username: user.username,
  }
}

interface IAuthorInputProps {
  /**
   * An optional class name for the wrapper element around the
   * author input component
   */
  readonly className?: string
  // tslint:disable-next-line:react-unused-props-and-state
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>

  readonly authors: ReadonlyArray<IAuthor>
  readonly onAuthorsUpdated: (authors: ReadonlyArray<IAuthor>) => void
}

interface IAuthorInputState {}

function prevPosition(doc: CodeMirror.Doc, pos: CodeMirror.Position) {
  return doc.posFromIndex(doc.indexFromPos(pos) - 1)
}

function nextPosition(doc: CodeMirror.Doc, pos: CodeMirror.Position) {
  return doc.posFromIndex(doc.indexFromPos(pos) + 1)
}

// mark ranges are inclusive, this checks exclusive
function posIsInsideMarkedText(doc: CodeMirror.Doc, pos: CodeMirror.Position) {
  const marks = (doc.findMarksAt(pos) as any) as ActualTextMarker[]
  const ix = doc.indexFromPos(pos)

  return marks.some(mark => {
    const markPos = mark.find()
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

function scanUntil(
  doc: Doc,
  start: Position,
  predicate: (doc: Doc, pos: Position) => boolean,
  iter: (doc: Doc, pos: Position) => Position
): Position {
  return scanWhile(doc, start, (doc, pos) => !predicate(doc, pos), iter)
}

function getHintRangeFromCursor(
  doc: CodeMirror.Doc,
  cursor: CodeMirror.Position
) {
  return {
    from: scanUntil(doc, cursor, isMarkOrWhitespace, prevPosition),
    to: scanUntil(doc, cursor, isMarkOrWhitespace, nextPosition),
  }
}

function appendTextMarker(
  cm: CodeMirror.Editor,
  text: string,
  options: CodeMirror.TextMarkerOptions
): ActualTextMarker {
  const doc = cm.getDoc()
  const from = doc.posFromIndex(Infinity)

  doc.replaceRange(text, from)
  const to = doc.posFromIndex(Infinity)

  return (doc.markText(from, to, options) as any) as ActualTextMarker
}

function orderByPosition(x: ActualTextMarker, y: ActualTextMarker) {
  const xPos = x.find()
  const yPos = y.find()

  if (xPos === undefined || yPos === undefined) {
    return compare(xPos, yPos)
  }

  return compare(xPos.from, yPos.from)
}

function arrayEquals<T>(x: ReadonlyArray<T>, y: ReadonlyArray<T>) {
  if (x.length !== y.length) {
    return false
  }

  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) {
      return false
    }
  }

  return true
}

// The types for CodeMirror.TextMarker is all wrong, this is what it
// actually looks like
interface ActualTextMarker extends CodeMirror.TextMarkerOptions {
  /** Remove the mark. */
  clear(): void

  /**
   * Returns a {from, to} object (both holding document positions), indicating
   * the current position of the marked range, or undefined if the marker is
   * no longer in the document.
   */
  find(): {
    from: CodeMirror.Position
    to: CodeMirror.Position
  }

  changed(): void
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

function getEmailAddressForUser(user: IUserHit) {
  if (user.email && user.email.length > 0) {
    return user.email
  }

  const url = URL.parse(user.endpoint)
  const host =
    url.hostname && !isDotComApiEndpoint(user.endpoint)
      ? url.hostname
      : 'github.com'

  return `${user.username}@users.noreply.${host}`
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

function markRangeAsHandle(
  doc: CodeMirror.Doc,
  from: CodeMirror.Position,
  to: CodeMirror.Position,
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

function triggerAutoCompleteBasedOnCursorPosition(cm: CodeMirror.Editor) {
  const doc = cm.getDoc()

  if (doc.somethingSelected()) {
    return
  }

  const cursor = doc.getCursor()
  const previousPos = prevPosition(doc, cursor)

  if (posIsInsideMarkedText(doc, previousPos)) {
    return
  }

  const char = doc.getRange(previousPos, cursor)

  if (char === '@') {
    ;(cm as any).showHint()
  }
}

export class AuthorInput extends React.Component<
  IAuthorInputProps,
  IAuthorInputState
> {
  private editor: CodeMirror.Editor | null = null
  private readonly resizeObserver: ResizeObserver
  private resizeDebounceId: number | null = null
  private hintActive: boolean = false
  private label: ActualTextMarker | null = null
  private placeholder: ActualTextMarker | null = null

  private authors: ReadonlyArray<IAuthor> = []
  // For undo association
  private readonly markAuthorMap = new Map<ActualTextMarker, IAuthor>()
  private readonly authorMarkMap = new Map<IAuthor, ActualTextMarker>()

  public constructor(props: IAuthorInputProps) {
    super(props)

    this.resizeObserver = new ResizeObserver(entries => {
      if (entries.length >= 1 && this.editor) {
        if (this.resizeDebounceId !== null) {
          cancelAnimationFrame(this.resizeDebounceId)
          this.resizeDebounceId = null
        }
        requestAnimationFrame(this.onResized)
      }
    })

    this.state = {}
  }

  private onResized = () => {
    this.resizeDebounceId = null
    if (this.editor) {
      this.editor.refresh()
    }
  }

  private onContainerRef = (elem: HTMLDivElement) => {
    this.editor = elem ? this.initializeCodeMirror(elem) : null

    if (elem) {
      this.resizeObserver.observe(elem)
    } else {
      this.resizeObserver.disconnect()
    }
  }

  private applyCompletion = (
    doc: CodeMirror.Doc,
    data: any,
    completion: any
  ) => {
    const from: CodeMirror.Position = completion.from || data.from
    const to: CodeMirror.Position = completion.to || data.to
    const author: IAuthor = completion.author
    const text = getDisplayTextForAuthor(author)

    doc.replaceRange(text, from, to, 'complete')

    const end = doc.posFromIndex(doc.indexFromPos(from) + text.length)
    const marker = markRangeAsHandle(doc, from, end, author)

    this.markAuthorMap.set(marker, author)
    this.authorMarkMap.set(author, marker)
  }

  private onAutocompleteUser = async (cm: CodeMirror.Editor) => {
    const doc = cm.getDoc()
    const cursor = doc.getCursor() as Readonly<CodeMirror.Position>

    const { from, to } = getHintRangeFromCursor(doc, cursor)

    var word = doc.getRange(from, to)

    const provider = this.props.autocompletionProviders.find(
      p => p.kind === 'user'
    )

    if (provider && provider instanceof UserAutocompletionProvider) {
      const needle = word.replace(/^@/, '')
      const hits = await provider.getAutocompletionItems(needle)

      return {
        list: hits.map(authorFromUserHit).map(author => ({
          author,
          text: getDisplayTextForAuthor(author),
          render: renderUserAutocompleteItem,
          className: 'autocompletion-item',
          hint: this.applyCompletion,
        })),
        from,
        to,
      }
    }

    return { list: [], from, to }
  }

  private initializeCodeMirror(host: HTMLDivElement) {
    const CodeMirrorOptions: CodeMirror.EditorConfiguration & {
      hintOptions: any
    } = {
      mode: null,
      lineWrapping: true,
      extraKeys: {
        Tab: false,
        'Shift-Tab': false,
        'Ctrl-Space': 'autocomplete',
      },
      hintOptions: {
        completeOnSingleClick: true,
        completeSingle: false,
        closeOnUnfocus: true,
        closeCharacters: /\s/,
        hint: this.onAutocompleteUser,
      },
    }

    const cm = CodeMirror(host, CodeMirrorOptions)
    const doc = cm.getDoc()

    this.label = appendTextMarker(cm, 'Co-Authors ', {
      atomic: true,
      inclusiveLeft: true,
      className: 'label',
      readOnly: true,
    })

    let from = this.label.find().to

    for (const author of this.props.authors) {
      const text = getDisplayTextForAuthor(author)
      const to = { ...from, ch: from.ch + text.length }

      doc.replaceRange(text, from, to)
      const marker = markRangeAsHandle(doc, from, to, author)

      this.markAuthorMap.set(marker, author)
      this.authorMarkMap.set(author, marker)

      from = to
    }

    this.placeholder = appendTextMarker(cm, '@username', {
      atomic: true,
      inclusiveRight: true,
      className: 'placeholder',
      readOnly: true,
      collapsed: this.props.authors.length > 0,
    })

    this.authors = this.props.authors

    cm.on('startCompletion', () => {
      this.hintActive = true
      console.log('startCompletion')
    })

    cm.on('endCompletion', () => {
      this.hintActive = false
      console.log('endCompletion')
    })

    cm.on('cursorActivity', () => {
      if (this.label && this.placeholder) {
        const labelRange = this.label.find()
        const placeholderRange = this.placeholder.find()

        const doc = cm.getDoc()

        const collapse =
          doc.indexFromPos(labelRange.to) !==
          doc.indexFromPos(placeholderRange.from)

        if (this.placeholder.collapsed !== collapse) {
          this.placeholder.collapsed = collapse
          this.placeholder.changed()
        }
      }
    })

    cm.on('changes', () => {
      if (!this.hintActive) {
        triggerAutoCompleteBasedOnCursorPosition(cm)
      }

      const doc = cm.getDoc()
      const markers = (doc.getAllMarks() as any) as ActualTextMarker[]

      const authors = new Array<IAuthor>()

      for (const marker of markers.sort(orderByPosition)) {
        if (marker.className !== 'handle') {
          continue
        }

        const author = this.markAuthorMap.get(marker)

        // shouldn't happen lol
        if (!author) {
          break
        }

        authors.push(author)
      }

      if (!arrayEquals(this.authors, authors)) {
        this.authors = authors
        this.props.onAuthorsUpdated(authors)
      }
    })

    return cm
  }

  public render() {
    return <div className={this.props.className} ref={this.onContainerRef} />
  }
}
