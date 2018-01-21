import * as React from 'react'
import * as CodeMirror from 'codemirror'

interface IAuthorInputProps {
  /**
   * An optional class name for the wrapper element around the
   * author input component
   */
  readonly className?: string
}

interface IAuthorInputState {}

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
    hint: (cm: CodeMirror.Editor) => {
      const doc = cm.getDoc()
      const cursor = doc.getCursor()
      const line = doc.getLine(cursor.line)

      var start = cursor.ch,
        end = cursor.ch
      while (start && /[\w@]/.test(line.charAt(start - 1))) --start
      while (end < line.length && /\w/.test(line.charAt(end))) ++end

      var word = line.slice(start, end).toLowerCase()

      console.log(cursor)
      return {
        list: [
          '@donokuda',
          '@niik',
          '@joshaber',
          '@iamwillshepherd',
          '@shiftkey',
          '@nerdneha',
        ].filter(x => x.indexOf(word) !== -1),
        from: { line: cursor.line, ch: start },
        to: cursor,
      }
    },
  },
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

  private appendTextMarker(
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

  private appendPlaceholder(cm: CodeMirror.Editor) {
    return this.appendTextMarker(cm, '@username', {
      atomic: true,
      inclusiveRight: true,
      className: 'placeholder',
      readOnly: true,
    })
  }

  private initializeCodeMirror(host: HTMLDivElement) {
    const cm = CodeMirror(host, CodeMirrorOptions)

    this.label = this.appendTextMarker(cm, 'Co-Authors ', {
      atomic: true,
      inclusiveLeft: true,
      className: 'label',
      readOnly: true,
    })

    this.placeholder = this.appendPlaceholder(cm)

    // const elem = document.createElement('span')
    // elem.classList.add('handle')
    // elem.innerText = '@iamwillshepherd'

    // doc.markText(
    //   { line: 0, ch: 16 },
    //   { line: 0, ch: 32 },
    //   {
    //     atomic: true,
    //     className: 'handle',
    //     readOnly: false,
    //     replacedWith: elem,
    //     handleMouseEvents: true,
    //   }
    // )

    cm.on('startCompletion', () => (this.hintActive = true))
    cm.on('endCompletion', () => (this.hintActive = false))
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

    cm.on('blur', () => {
      // const atomicMarkRange = cm.getDoc()
      //   .getAllMarks()
      //   .filter(m => m.getOptions().atomic === true)
      //   .reduce((prev, cur) => {
      //     return {
      //       from: prev.find()
      //     }
      //   }, { from: CodeMirror.Pos(0, 0), to: CodeMirror.Pos(0, 0) })
    })

    return cm
  }

  public render() {
    return <div className={this.props.className} ref={this.onContainerRef} />
  }
}
