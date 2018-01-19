import * as React from 'react'
import * as CodeMirror from 'codemirror'

interface IAuthorInputProps {
  /**
   * An optional class name for the wrapper element around the
   * author input component
   */
  readonly className?: string
}

interface IAuthorInputState {
  readonly editor: CodeMirror.Editor | null
}

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
    closeOnUnfocus: false,
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

export class AuthorInput extends React.Component<
  IAuthorInputProps,
  IAuthorInputState
> {
  public constructor(props: IAuthorInputProps) {
    super(props)

    this.state = { editor: null }
  }

  private onContainerRef = (elem: HTMLDivElement) => {
    this.setState({
      editor: elem ? this.initializeCodeMirror(elem) : null,
    })
  }

  private initializeCodeMirror(host: HTMLDivElement) {
    const cm = CodeMirror(host, CodeMirrorOptions)
    const doc = cm.getDoc()

    cm.setValue('Co-Authored-By: @iamwillshepherd')
    doc.markText(
      { line: 0, ch: 0 },
      { line: 0, ch: 16 },
      {
        atomic: true,
        inclusiveLeft: true,
        className: 'preText',
        readOnly: true,
      }
    )

    const elem = document.createElement('span')
    elem.classList.add('handle')
    elem.innerText = '@iamwillshepherd'

    doc.markText(
      { line: 0, ch: 16 },
      { line: 0, ch: 32 },
      {
        atomic: true,
        className: 'handle',
        readOnly: false,
        replacedWith: elem,
        handleMouseEvents: true,
      }
    )

    return cm
  }

  public render() {
    return <div className={this.props.className} ref={this.onContainerRef} />
  }
}
