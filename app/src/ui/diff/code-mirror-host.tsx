import * as React from 'react'
import * as CodeMirror from 'codemirror'

interface ICodeMirrorHostProps {
  value: string,
  options?: CodeMirror.EditorConfiguration
}

export class CodeMirrorHost extends React.Component<ICodeMirrorHostProps, void> {

  private textArea: HTMLTextAreaElement | null
  private codeMirror: CodeMirror.EditorFromTextArea | null

  public componentDidMount() {
    this.codeMirror = CodeMirror.fromTextArea(this.textArea!, this.props.options)
    this.codeMirror.setValue(this.props.value)
  }

  public render() {
    return (
      <div className='ReactCodeMirror'>
        <textarea ref={(e) => this.textArea = e}></textarea>
      </div>
    )
  }
}
