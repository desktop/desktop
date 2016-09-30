import * as React from 'react'
import * as CodeMirror from 'codemirror'

interface ICodeMirrorHostProps {
  value: string,
  options?: CodeMirror.EditorConfiguration
  onRenderLine?: (cm: CodeMirror.Editor, line: CodeMirror.LineHandle, element: HTMLElement) => void
}

export class CodeMirrorHost extends React.Component<ICodeMirrorHostProps, void> {

  private textArea: HTMLTextAreaElement | null
  private codeMirror: CodeMirror.EditorFromTextArea | null

  public componentDidMount() {
    const codeMirror = this.codeMirror = CodeMirror.fromTextArea(this.textArea!, this.props.options)

    // The definition for renderLine in DefinitelyTyped is wrong, it says that
    // the line argument is a number when, in fact, it's a LineHandle.
    // Fake it for now
    const cm = codeMirror as any
    cm.on('renderLine', this.onRenderLine)

    codeMirror.setValue(this.props.value)
  }

  private onRenderLine = (cm: CodeMirror.Editor, line: CodeMirror.LineHandle, element: HTMLElement) => {
    if (this.props.onRenderLine) {
      this.props.onRenderLine(cm, line, element)
    }
  }

  public render() {
    return (
      <div className='ReactCodeMirror'>
        <textarea ref={(e) => this.textArea = e}></textarea>
      </div>
    )
  }
}
