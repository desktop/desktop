import * as React from 'react'
import * as CodeMirror from 'codemirror'

interface ICodeMirrorHostProps {
  /**
   * An optional class name for the wrapper element around the
   * CodeMirror component
   */
  readonly className?: string

  /** The text contents for the editor */
  readonly value: string,

  /** Any CodeMirror specific settings */
  readonly options?: CodeMirror.EditorConfiguration

  /** Callback for diff to control whether selection is enabled */
  readonly isSelectionEnabled?: () => boolean

  /** Callback for when CodeMirror renders (or re-renders) a line */
  readonly onRenderLine?: (cm: CodeMirror.Editor, line: CodeMirror.LineHandle, element: HTMLElement) => void

  /** Callback for when CodeMirror has completed a batch of changes to the editor */
  readonly onChanges?: (cm: CodeMirror.Editor, change: CodeMirror.EditorChangeLinkedList[]) => void

  /** Callback when user is hovering over diff text */
  readonly onShowHoverStatus?: (line: number, active: boolean) => void
}

/**
 * A component hosting a CodeMirror instance
 */
export class CodeMirrorHost extends React.Component<ICodeMirrorHostProps, void> {

  private wrapper: HTMLDivElement | null
  private codeMirror: CodeMirror.Editor | null

  private gutterWidth_: number | null
  private lineHeight_: number | null

  /**
   * Gets the internal CodeMirror instance or null if CodeMirror hasn't
   * been initialized yet (happens when component mounts)
   */
  public getEditor(): CodeMirror.Editor | null {
    return this.codeMirror
  }

  public componentDidMount() {
    this.codeMirror = CodeMirror(this.wrapper!, this.props.options)

    this.codeMirror.on('renderLine', this.onRenderLine)
    this.codeMirror.on('changes', this.onChanges)
    this.codeMirror.on('beforeSelectionChange', this.beforeSelectionChanged)

    this.codeMirror.setValue(this.props.value)
  }

  public componentWillUnmount() {
    const cm = this.codeMirror

    if (cm) {
      cm.off('changes', this.onChanges)
      cm.off('renderLine', this.onRenderLine)
      cm.off('beforeSelectionChange', this.beforeSelectionChanged)

      this.codeMirror = null
    }
  }

  public componentWillReceiveProps(nextProps: ICodeMirrorHostProps) {
    if (this.props.value !== nextProps.value) {
      this.codeMirror!.setValue(nextProps.value)
    }
  }

  public shouldComponentUpdate(nextProps: ICodeMirrorHostProps) {
    // NB This is the only time we actually have to re-render.
    // Updating of values is done in componentWillReceiveProps,
    // all event handlers are marshalled through private non-changing
    // wrappers.
    return nextProps.className !== this.props.className
  }

  private beforeSelectionChanged = (cm: CodeMirror.Editor, changeObj: any) => {
    if (this.props.isSelectionEnabled) {
      if (!this.props.isSelectionEnabled()) {
        // ignore whatever the user has currently selected, pass in a
        // "nothing selected" value
        // NOTE:
        // - `head` is the part of the selection that is moving
        // - `anchor` is the other end
        changeObj.update([ { head: { line: 0, ch: 0 } , anchor: { line: 0, ch: 0 } } ])
      }
    }
  }

  private onChanges = (cm: CodeMirror.Editor, changes: CodeMirror.EditorChangeLinkedList[]) => {

    // when the text changes, clear the cached value for the gutter width
    this.gutterWidth_ = null

    if (this.props.onChanges) {
      this.props.onChanges(cm, changes)
    }
  }

  private onRenderLine = (cm: CodeMirror.Editor, line: CodeMirror.LineHandle, element: HTMLElement) => {
    if (this.props.onRenderLine) {
      this.props.onRenderLine(cm, line, element)
    }
  }

  /**
   * compute the gutter width using the rendered elements in the current diff
   */
  private resolveGutterWidth = (): number | null => {

    if (this.gutterWidth_) {
      return this.gutterWidth_
    }

    if (!this.wrapper) {
      return null
    }

    const gutterElements = this.wrapper.getElementsByClassName('diff-line-number')

    // if we don't have at least two elements rendered (i.e. one row), give up
    if (gutterElements.length < 2) {
      return null
    }

    const left = gutterElements[0]
    const right = gutterElements[1]

    // if these elements haven't been rendered, they won't have these values set
    if (left.clientWidth === 0 || right.clientWidth === 0) {
      return null
    }

    this.gutterWidth_ = left.clientWidth + right.clientWidth

    return this.gutterWidth_
  }

  private resolveLineHeight = (): number | null => {
    if (this.lineHeight_) {
      return this.lineHeight_
    }

    if (!this.codeMirror) {
      return null
    }

    // HACK: coming back to this, FML codemirror
    this.lineHeight_ = 19.625 //this.codeMirror.defaultTextHeight()

    return this.lineHeight_
  }

  private onMouseMove = (ev: MouseEvent) => {
    if (!this.props.onShowHoverStatus) {
      return
    }

    const gutterWidth = this.resolveGutterWidth()
    if (!gutterWidth) {
      console.debug('unable to compute the diff gutter width')
      return
    }

    const lineHeight = this.resolveLineHeight()
    if (!lineHeight) {
      console.debug('unable to compute the line height')
      return
    }

    if (this.wrapper) {
      const relativeTop = ev.clientY - this.wrapper.offsetTop
      const lineNumber = Math.floor(relativeTop / lineHeight)

      const offset = this.wrapper.offsetLeft
      const pageX = ev.pageX

      const distanceFromEdge = pageX - (offset + gutterWidth)
      const isActive = distanceFromEdge <= 15

      this.props.onShowHoverStatus(lineNumber, isActive)
    }
  }

  private onRef = (ref: HTMLDivElement) => {
    if (ref) {
      this.wrapper = ref
      this.wrapper.addEventListener('mousemove', this.onMouseMove)
    } else {
      if(this.wrapper) {
        this.wrapper.removeEventListener('mousemove', this.onMouseMove)
      }
    }
  }

  public render() {
    return (
      <div className={this.props.className} ref={this.onRef}>
      </div>
    )
  }
}
