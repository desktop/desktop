import * as React from 'react'
import * as CodeMirror from 'codemirror'

interface ICodeMirrorHostProps {
  className?: string
  value: string,
  options?: CodeMirror.EditorConfiguration
  onRenderLine?: (cm: CodeMirror.Editor, line: CodeMirror.LineHandle, element: HTMLElement) => void
  onChanges?: (cm: CodeMirror.Editor, change: CodeMirror.EditorChangeLinkedList[]) => void
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

    codeMirror.on('changes', this.onChanges)

    codeMirror.setValue(this.props.value)
  }

  private onChanges = (cm: CodeMirror.Editor, changes: CodeMirror.EditorChangeLinkedList[]) => {
    if (this.props.onChanges) {
      this.props.onChanges(cm, changes)
    }
  }

  private onRenderLine = (cm: CodeMirror.Editor, line: CodeMirror.LineHandle, element: HTMLElement) => {
    if (this.props.onRenderLine) {
      this.props.onRenderLine(cm, line, element)
    }
  }

  public render() {
    return (
      <div className={this.props.className}>
        <textarea ref={(e) => this.textArea = e}></textarea>
      </div>
    )
  }
}
