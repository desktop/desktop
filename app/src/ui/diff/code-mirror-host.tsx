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

  private wrapper: HTMLDivElement | null
  private codeMirror: CodeMirror.Editor | null

  public getEditor(): CodeMirror.Editor | null {
    return this.codeMirror
  }

  public componentDidMount() {

    this.codeMirror = CodeMirror(this.wrapper!, this.props.options)

    // The definition for renderLine in DefinitelyTyped is wrong, it says that
    // the line argument is a number when, in fact, it's a LineHandle so we'll
    // opt out of type safety until we can update DefinitelyTyped :cry:
    const cm = this.codeMirror! as any

    cm.on('renderLine', this.onRenderLine)
    cm.on('changes', this.onChanges)

    cm.setValue(this.props.value)
  }

  public componentWillUnmount() {
    // See componentDidMount
    const cm = this.codeMirror as any

    if (cm) {
      cm.off('changes', this.onChanges)
      cm.off('renderLine', this.onRenderLine)

      this.codeMirror = null
    }
  }

  public shouldComponentUpdate(nextProps: ICodeMirrorHostProps, nextState: void): boolean {
    this.codeMirror!.setValue(nextProps.value)
    return false
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
      <div className={this.props.className} ref={(e) => this.wrapper = e}>
      </div>
    )
  }
}
