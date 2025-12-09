import * as React from 'react'
import { useEffect, useCallback, useRef } from 'react'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react'
import { commonmark, toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand, wrapInHeadingCommand, wrapInBulletListCommand, wrapInOrderedListCommand, wrapInBlockquoteCommand, insertHrCommand, createCodeBlockCommand, toggleLinkCommand, insertImageCommand } from '@milkdown/preset-commonmark'
import { gfm, toggleStrikethroughCommand, insertTableCommand } from '@milkdown/preset-gfm'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'
import { cursor } from '@milkdown/plugin-cursor'
import { indent } from '@milkdown/plugin-indent'
import { trailing } from '@milkdown/plugin-trailing'
import { listItemBlockComponent } from '@milkdown/components/list-item-block'
import { replaceAll, callCommand } from '@milkdown/utils'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IMilkdownEditorProps {
  /** Initial markdown content */
  readonly content: string
  /** Called when content changes */
  readonly onChange: (content: string) => void
  /** Called when save is requested (Cmd/Ctrl+S) */
  readonly onSave: () => void
  /** Whether the editor should be read-only */
  readonly readOnly?: boolean
}

/** Formatting toolbar for the Milkdown editor */
function FormattingToolbar({ readOnly }: { readOnly?: boolean }) {
  const [loading, getInstance] = useInstance()

  const runCommand = useCallback((command: any, payload?: any) => {
    const editor = getInstance()
    if (!loading && editor) {
      // Run the command
      editor.action(callCommand(command.key, payload))
      // Refocus the editor after command completes
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        requestAnimationFrame(() => view.focus())
      })
    }
  }, [loading, getInstance])

  const insertText = useCallback((text: string) => {
    const editor = getInstance()
    if (!loading && editor) {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const { state, dispatch } = view
        const { from, to } = state.selection
        dispatch(state.tr.insertText(text, from, to))
        // Refocus the editor
        requestAnimationFrame(() => view.focus())
      })
    }
  }, [loading, getInstance])

  // Prevent button from stealing focus
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  if (readOnly) {
    return null
  }

  return (
    <div className="milkdown-toolbar">
      <div className="toolbar-group">
        <button
          className="toolbar-button"
          onClick={() => runCommand(toggleStrongCommand)}
          onMouseDown={handleMouseDown}
          title="Bold (Cmd+B)"
        >
          <Octicon symbol={octicons.bold} />
        </button>
        <button
          className="toolbar-button"
          onClick={() => runCommand(toggleEmphasisCommand)}
          onMouseDown={handleMouseDown}
          title="Italic (Cmd+I)"
        >
          <Octicon symbol={octicons.italic} />
        </button>
        <button
          className="toolbar-button"
          onClick={() => runCommand(toggleStrikethroughCommand)}
          onMouseDown={handleMouseDown}
          title="Strikethrough"
        >
          <Octicon symbol={octicons.strikethrough} />
        </button>
        <button
          className="toolbar-button"
          onClick={() => runCommand(toggleInlineCodeCommand)}
          onMouseDown={handleMouseDown}
          title="Inline Code"
        >
          <Octicon symbol={octicons.code} />
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button
          className="toolbar-button"
          onClick={() => runCommand(wrapInHeadingCommand, 1)}
          onMouseDown={handleMouseDown}
          title="Heading 1"
        >
          H1
        </button>
        <button
          className="toolbar-button"
          onClick={() => runCommand(wrapInHeadingCommand, 2)}
          onMouseDown={handleMouseDown}
          title="Heading 2"
        >
          H2
        </button>
        <button
          className="toolbar-button"
          onClick={() => runCommand(wrapInHeadingCommand, 3)}
          onMouseDown={handleMouseDown}
          title="Heading 3"
        >
          H3
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button
          className="toolbar-button"
          onClick={() => runCommand(wrapInBulletListCommand)}
          onMouseDown={handleMouseDown}
          title="Bullet List"
        >
          <Octicon symbol={octicons.listUnordered} />
        </button>
        <button
          className="toolbar-button"
          onClick={() => runCommand(wrapInOrderedListCommand)}
          onMouseDown={handleMouseDown}
          title="Numbered List"
        >
          <Octicon symbol={octicons.listOrdered} />
        </button>
        <button
          className="toolbar-button"
          onClick={() => insertText('- [ ] ')}
          onMouseDown={handleMouseDown}
          title="Task List"
        >
          <Octicon symbol={octicons.tasklist} />
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button
          className="toolbar-button"
          onClick={() => runCommand(wrapInBlockquoteCommand)}
          onMouseDown={handleMouseDown}
          title="Quote"
        >
          <Octicon symbol={octicons.quote} />
        </button>
        <button
          className="toolbar-button"
          onClick={() => runCommand(insertHrCommand)}
          onMouseDown={handleMouseDown}
          title="Horizontal Rule"
        >
          <Octicon symbol={octicons.horizontalRule} />
        </button>
        <button
          className="toolbar-button"
          onClick={() => runCommand(createCodeBlockCommand)}
          onMouseDown={handleMouseDown}
          title="Code Block"
        >
          <Octicon symbol={octicons.codeSquare} />
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button
          className="toolbar-button"
          onClick={() => runCommand(toggleLinkCommand, { href: '' })}
          onMouseDown={handleMouseDown}
          title="Link"
        >
          <Octicon symbol={octicons.link} />
        </button>
        <button
          className="toolbar-button"
          onClick={() => runCommand(insertImageCommand, { src: '', alt: 'image' })}
          onMouseDown={handleMouseDown}
          title="Image"
        >
          <Octicon symbol={octicons.image} />
        </button>
        <button
          className="toolbar-button"
          onClick={() => runCommand(insertTableCommand, { row: 3, col: 3 })}
          onMouseDown={handleMouseDown}
          title="Table"
        >
          <Octicon symbol={octicons.table} />
        </button>
      </div>
    </div>
  )
}

/** Inner component that sets up the editor with hooks */
function MilkdownEditorCore(props: IMilkdownEditorProps) {
  const { content, onChange, onSave, readOnly } = props

  // Track if this is the initial mount to avoid replacing content on first render
  const isInitialMount = useRef(true)
  // Track the last content we set to avoid feedback loops
  const lastSetContent = useRef(content)
  // Ref for readOnly to use in callbacks without causing re-renders
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly

  // Stable callback refs to avoid recreating the editor
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Set up the editor
  useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, content)

        // Set up change listener
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          // Only fire onChange if not read-only and content actually changed
          if (!readOnlyRef.current && markdown !== lastSetContent.current) {
            lastSetContent.current = markdown
            onChangeRef.current(markdown)
          }
        })
      })
      .use(commonmark)
      .use(gfm)
      .use(listItemBlockComponent)
      .use(listener)
      .use(history)
      .use(clipboard)
      .use(cursor)
      .use(indent)
      .use(trailing)
  }, []) // Empty deps - only create editor once

  // Get editor instance for dynamic updates
  const [loading, getInstance] = useInstance()

  // Update content when prop changes (but not on initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    const editor = getInstance()
    if (!loading && editor && content !== lastSetContent.current) {
      lastSetContent.current = content
      editor.action(replaceAll(content))
    }
  }, [content, loading, getInstance])

  // Update editable state when readOnly changes
  useEffect(() => {
    const editor = getInstance()
    if (!loading && editor) {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        // Update the editable prop on the ProseMirror view
        view.setProps({
          ...view.props,
          editable: () => !readOnly
        })
      })
    }
  }, [readOnly, loading, getInstance])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Cmd/Ctrl+S to save
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      onSave()
    }
  }, [onSave])

  return (
    <div
      className="milkdown-editor-wrapper"
      data-readonly={readOnly}
      onKeyDown={handleKeyDown}
    >
      <FormattingToolbar readOnly={readOnly} />
      <div className="milkdown-editor-container">
        <Milkdown />
      </div>
    </div>
  )
}

/** WYSIWYG Markdown editor using Milkdown */
export class MilkdownEditor extends React.Component<IMilkdownEditorProps> {
  public render() {
    return (
      <MilkdownProvider>
        <MilkdownEditorCore {...this.props} />
      </MilkdownProvider>
    )
  }
}
