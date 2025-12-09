import * as React from 'react'
import * as Path from 'path'
import * as fs from 'fs'
import { spawn } from 'child_process'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { showContextualMenu } from '../../lib/menu-item'
import { IMenuItem } from '../../lib/menu-item'

/** Script button configuration */
interface IScriptConfig {
  readonly id: string
  readonly file: string
  readonly label: string
  readonly icon: typeof octicons.play
  readonly className?: string
}

/** All supported utility scripts (shown in overflow row) */
const UtilityScripts: ReadonlyArray<IScriptConfig> = [
  { id: 'build', file: 'build.sh', label: 'Build', icon: octicons.package_ },
  { id: 'dev', file: 'dev.sh', label: 'Dev', icon: octicons.play },
  { id: 'serve', file: 'serve.sh', label: 'Serve', icon: octicons.server },
  { id: 'watch', file: 'watch.sh', label: 'Watch', icon: octicons.eye },
  { id: 'test', file: 'test.sh', label: 'Test', icon: octicons.beaker },
  { id: 'lint', file: 'lint.sh', label: 'Lint', icon: octicons.checklist },
  { id: 'setup', file: 'setup.sh', label: 'Setup', icon: octicons.gear },
  { id: 'install', file: 'install.sh', label: 'Install', icon: octicons.download },
  { id: 'bootstrap', file: 'bootstrap.sh', label: 'Bootstrap', icon: octicons.rocket },
  { id: 'migrate', file: 'migrate.sh', label: 'Migrate', icon: octicons.database },
  { id: 'seed', file: 'seed.sh', label: 'Seed', icon: octicons.database },
  { id: 'deploy', file: 'deploy.sh', label: 'Deploy', icon: octicons.upload },
  { id: 'release', file: 'release.sh', label: 'Release', icon: octicons.tag },
  { id: 'clean', file: 'clean.sh', label: 'Clean', icon: octicons.trash },
  { id: 'docker-up', file: 'docker-up.sh', label: 'Docker Up', icon: octicons.container },
  { id: 'docker-down', file: 'docker-down.sh', label: 'Docker Down', icon: octicons.container },
]

/** Dev scripts (shown in dedicated row) */
const DevScripts: ReadonlyArray<IScriptConfig> = [
  { id: 'run', file: 'run.sh', label: 'Run', icon: octicons.play },
  { id: 'start-dev', file: 'start-dev.sh', label: 'Start Dev', icon: octicons.play, className: 'start-dev' },
  { id: 'stop-dev', file: 'stop-dev.sh', label: 'Stop Dev', icon: octicons.square, className: 'stop-dev' },
  { id: 'restart-dev', file: 'restart-dev.sh', label: 'Restart Dev', icon: octicons.sync, className: 'restart-dev' },
]

interface IFileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: IFileTreeNode[]
  isExpanded?: boolean
}

interface ICodeViewSidebarProps {
  readonly repositoryPath: string
  readonly selectedFile: string | null
  readonly onFileSelected: (filePath: string) => void
  readonly onFileCreated?: (filePath: string) => void
  readonly onDeleteItem?: (itemPath: string, isDirectory: boolean) => void
  readonly onRenameItem?: (itemPath: string) => void
  readonly onOpenTerminal?: () => void
  readonly onOpenClaude?: () => void
}

interface ICodeViewSidebarState {
  readonly tree: IFileTreeNode | null
  readonly expandedPaths: Set<string>
  readonly isLoading: boolean
  /** 'file' or 'folder' when creating, null otherwise */
  readonly creatingType: 'file' | 'folder' | null
  /** The input value for the new item name */
  readonly newItemName: string
  /** Path of item being dragged */
  readonly draggingPath: string | null
  /** Path of folder being hovered over during drag */
  readonly dropTargetPath: string | null
  /** Set of available script IDs that exist in the repository */
  readonly availableScripts: Set<string>
  /** Whether CLAUDE.md or claude.md exists in the repository root */
  readonly hasClaudeMd: boolean
  /** Whether the scripts overflow menu is open */
  readonly scriptsMenuOpen: boolean
}

export class CodeViewSidebar extends React.Component<
  ICodeViewSidebarProps,
  ICodeViewSidebarState
> {
  private newItemInputRef = React.createRef<HTMLInputElement>()
  private fileWatcher: fs.FSWatcher | null = null
  private refreshDebounceTimer: NodeJS.Timeout | null = null
  private readonly REFRESH_DEBOUNCE_MS = 300

  public constructor(props: ICodeViewSidebarProps) {
    super(props)
    this.state = {
      tree: null,
      expandedPaths: new Set([props.repositoryPath]),
      isLoading: true,
      creatingType: null,
      newItemName: '',
      draggingPath: null,
      dropTargetPath: null,
      availableScripts: new Set(),
      hasClaudeMd: false,
      scriptsMenuOpen: false,
    }
  }

  public componentDidMount() {
    this.loadFileTree()
    this.startFileWatcher()
  }

  public componentDidUpdate(prevProps: ICodeViewSidebarProps) {
    if (prevProps.repositoryPath !== this.props.repositoryPath) {
      this.stopFileWatcher()
      this.loadFileTree()
      this.startFileWatcher()
    }
  }

  public componentWillUnmount() {
    this.stopFileWatcher()
    if (this.refreshDebounceTimer) {
      clearTimeout(this.refreshDebounceTimer)
    }
  }

  private startFileWatcher() {
    try {
      // Watch the repository directory recursively for changes
      this.fileWatcher = fs.watch(
        this.props.repositoryPath,
        { recursive: true },
        (eventType, filename) => {
          // Skip hidden files and node_modules
          if (filename && (filename.startsWith('.') || filename.includes('node_modules'))) {
            return
          }
          this.debouncedRefresh()
        }
      )

      this.fileWatcher.on('error', (error) => {
        console.error('File watcher error:', error)
      })
    } catch (error) {
      console.error('Failed to start file watcher:', error)
    }
  }

  private stopFileWatcher() {
    if (this.fileWatcher) {
      this.fileWatcher.close()
      this.fileWatcher = null
    }
  }

  private debouncedRefresh = () => {
    // Debounce refresh to avoid excessive reloading when multiple files change
    if (this.refreshDebounceTimer) {
      clearTimeout(this.refreshDebounceTimer)
    }
    this.refreshDebounceTimer = setTimeout(() => {
      this.loadFileTree()
    }, this.REFRESH_DEBOUNCE_MS)
  }

  /** Refresh the file tree (call after creating/deleting files) */
  public refreshFileTree() {
    this.loadFileTree()
  }

  private async loadFileTree() {
    this.setState({ isLoading: true })
    try {
      const tree = await this.buildFileTree(this.props.repositoryPath)

      // Check all scripts (both utility and dev scripts)
      const allScripts = [...UtilityScripts, ...DevScripts]
      const scriptChecks = await Promise.all(
        allScripts.map(async script => ({
          id: script.id,
          exists: await this.checkFileExists(Path.join(this.props.repositoryPath, script.file))
        }))
      )

      const availableScripts = new Set(
        scriptChecks.filter(s => s.exists).map(s => s.id)
      )

      // Check for CLAUDE.md
      const [hasClaudeMdUpper, hasClaudeMdLower] = await Promise.all([
        this.checkFileExists(Path.join(this.props.repositoryPath, 'CLAUDE.md')),
        this.checkFileExists(Path.join(this.props.repositoryPath, 'claude.md')),
      ])
      const hasClaudeMd = hasClaudeMdUpper || hasClaudeMdLower

      this.setState({ tree, isLoading: false, availableScripts, hasClaudeMd })
    } catch (error) {
      console.error('Failed to load file tree:', error)
      this.setState({ isLoading: false })
    }
  }

  private async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK)
      return true
    } catch {
      return false
    }
  }

  private async buildFileTree(dirPath: string): Promise<IFileTreeNode> {
    const name = Path.basename(dirPath) || dirPath
    const node: IFileTreeNode = {
      name,
      path: dirPath,
      isDirectory: true,
      children: [],
    }

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
      const children: IFileTreeNode[] = []

      for (const entry of entries) {
        // Skip hidden files and .git directory
        if (entry.name.startsWith('.')) {
          continue
        }
        // Skip node_modules for performance
        if (entry.name === 'node_modules') {
          continue
        }

        const childPath = Path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          children.push({
            name: entry.name,
            path: childPath,
            isDirectory: true,
            children: undefined, // Lazy load
          })
        } else {
          children.push({
            name: entry.name,
            path: childPath,
            isDirectory: false,
          })
        }
      }

      // Sort: directories first, then alphabetically
      children.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })

      node.children = children
    } catch (error) {
      console.error(`Failed to read directory ${dirPath}:`, error)
    }

    return node
  }

  private async expandDirectory(node: IFileTreeNode): Promise<IFileTreeNode[]> {
    if (!node.isDirectory) return []

    try {
      const entries = await fs.promises.readdir(node.path, { withFileTypes: true })
      const children: IFileTreeNode[] = []

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        if (entry.name === 'node_modules') continue

        const childPath = Path.join(node.path, entry.name)
        children.push({
          name: entry.name,
          path: childPath,
          isDirectory: entry.isDirectory(),
          children: entry.isDirectory() ? undefined : undefined,
        })
      }

      children.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })

      return children
    } catch (error) {
      console.error(`Failed to expand directory ${node.path}:`, error)
      return []
    }
  }

  private onNodeClick = async (node: IFileTreeNode) => {
    if (node.isDirectory) {
      const { expandedPaths } = this.state
      const newExpanded = new Set(expandedPaths)

      if (newExpanded.has(node.path)) {
        newExpanded.delete(node.path)
      } else {
        newExpanded.add(node.path)
        // Lazy load children if needed
        if (node.children === undefined) {
          const children = await this.expandDirectory(node)
          this.updateNodeChildren(node.path, children)
        }
      }

      this.setState({ expandedPaths: newExpanded })
    } else {
      this.props.onFileSelected(node.path)
    }
  }

  private updateNodeChildren(path: string, children: IFileTreeNode[]) {
    const { tree } = this.state
    if (!tree) return

    const updateNode = (node: IFileTreeNode): IFileTreeNode => {
      if (node.path === path) {
        return { ...node, children }
      }
      if (node.children) {
        return { ...node, children: node.children.map(updateNode) }
      }
      return node
    }

    this.setState({ tree: updateNode(tree) })
  }

  private getFileIcon(node: IFileTreeNode): typeof octicons.file {
    if (node.isDirectory) {
      return this.state.expandedPaths.has(node.path)
        ? octicons.fileDirectoryOpenFill
        : octicons.fileDirectoryFill
    }

    const ext = Path.extname(node.name).toLowerCase()
    switch (ext) {
      case '.ts':
      case '.tsx':
      case '.js':
      case '.jsx':
        return octicons.fileCode
      case '.json':
      case '.yml':
      case '.yaml':
        return octicons.fileCode
      case '.md':
      case '.mdx':
        return octicons.markdown
      case '.css':
      case '.scss':
      case '.less':
        return octicons.paintbrush
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.gif':
      case '.svg':
        return octicons.image
      default:
        return octicons.file
    }
  }

  // Drag and drop handlers
  private onDragStart = (node: IFileTreeNode, e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', node.path)
    e.dataTransfer.effectAllowed = 'move'
    this.setState({ draggingPath: node.path })
  }

  private onDragEnd = () => {
    this.setState({ draggingPath: null, dropTargetPath: null })
  }

  private onDragOver = (node: IFileTreeNode, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    // Only allow dropping on directories
    if (!node.isDirectory) {
      e.dataTransfer.dropEffect = 'none'
      return
    }

    // Don't allow dropping on itself or its children
    const { draggingPath } = this.state
    if (draggingPath && (node.path === draggingPath || node.path.startsWith(draggingPath + Path.sep))) {
      e.dataTransfer.dropEffect = 'none'
      return
    }

    e.dataTransfer.dropEffect = 'move'
    if (this.state.dropTargetPath !== node.path) {
      this.setState({ dropTargetPath: node.path })
    }
  }

  private onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    // Only clear if we're leaving the drop target (not entering a child)
    const relatedTarget = e.relatedTarget as HTMLElement
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      this.setState({ dropTargetPath: null })
    }
  }

  private onDrop = async (targetNode: IFileTreeNode, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    const sourcePath = e.dataTransfer.getData('text/plain')
    if (!sourcePath || !targetNode.isDirectory) {
      this.setState({ draggingPath: null, dropTargetPath: null })
      return
    }

    // Don't drop on itself or parent
    if (sourcePath === targetNode.path || Path.dirname(sourcePath) === targetNode.path) {
      this.setState({ draggingPath: null, dropTargetPath: null })
      return
    }

    const fileName = Path.basename(sourcePath)
    const destPath = Path.join(targetNode.path, fileName)

    try {
      await fs.promises.rename(sourcePath, destPath)
      this.refreshFileTree()
    } catch (err) {
      console.error('Failed to move file:', err)
    }

    this.setState({ draggingPath: null, dropTargetPath: null })
  }

  // Delete handler
  private onDeleteNode = async (node: IFileTreeNode) => {
    const confirmMessage = node.isDirectory
      ? `Are you sure you want to delete the folder "${node.name}" and all its contents?`
      : `Are you sure you want to delete "${node.name}"?`

    // Use confirm dialog - in Electron this works
    const confirmed = window.confirm(confirmMessage)
    if (!confirmed) return

    try {
      if (node.isDirectory) {
        await fs.promises.rm(node.path, { recursive: true, force: true })
      } else {
        await fs.promises.unlink(node.path)
      }
      this.refreshFileTree()
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  private onNodeContextMenu = (
    node: IFileTreeNode,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const items: IMenuItem[] = []

    // For directories, show "New File" and "New Folder" options
    items.push({
      label: 'New File…',
      action: () => this.onNewFileButtonClick(),
    })
    items.push({
      label: 'New Folder…',
      action: () => this.onNewFolderButtonClick(),
    })

    // Add separator
    items.push({ type: 'separator' })

    // Delete option
    items.push({
      label: node.isDirectory ? 'Delete Folder' : 'Delete',
      action: () => this.onDeleteNode(node),
    })

    showContextualMenu(items)
  }

  private onSidebarContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const items: IMenuItem[] = [
      {
        label: 'New File…',
        action: () => this.onNewFileButtonClick(),
      },
      {
        label: 'New Folder…',
        action: () => this.onNewFolderButtonClick(),
      },
    ]

    showContextualMenu(items)
  }

  private renderNode(node: IFileTreeNode, depth: number = 0): JSX.Element {
    const isExpanded = this.state.expandedPaths.has(node.path)
    const isSelected = this.props.selectedFile === node.path
    const isDragging = this.state.draggingPath === node.path
    const isDropTarget = this.state.dropTargetPath === node.path
    const paddingLeft = depth * 16 + 8

    const className = [
      'file-tree-item',
      isSelected ? 'selected' : '',
      isDragging ? 'dragging' : '',
      isDropTarget ? 'drop-target' : '',
    ].filter(Boolean).join(' ')

    return (
      <div key={node.path} className="file-tree-node">
        <div
          className={className}
          style={{ paddingLeft }}
          onClick={() => this.onNodeClick(node)}
          onContextMenu={e => this.onNodeContextMenu(node, e)}
          draggable
          onDragStart={e => this.onDragStart(node, e)}
          onDragEnd={this.onDragEnd}
          onDragOver={e => this.onDragOver(node, e)}
          onDragLeave={this.onDragLeave}
          onDrop={e => this.onDrop(node, e)}
        >
          {node.isDirectory && (
            <span className="expand-icon">
              <Octicon
                symbol={isExpanded ? octicons.chevronDown : octicons.chevronRight}
              />
            </span>
          )}
          <Octicon symbol={this.getFileIcon(node)} className="file-icon" />
          <span className="file-name">{node.name}</span>
        </div>
        {node.isDirectory && isExpanded && node.children && (
          <div className="file-tree-children">
            {node.children.map(child => this.renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  private onNewFileButtonClick = () => {
    this.setState({ creatingType: 'file', newItemName: '' }, () => {
      this.newItemInputRef.current?.focus()
    })
  }

  private onNewFolderButtonClick = () => {
    this.setState({ creatingType: 'folder', newItemName: '' }, () => {
      this.newItemInputRef.current?.focus()
    })
  }

  private onScriptClick = (script: IScriptConfig) => {
    this.runShellScript(script.file)
  }

  private runShellScript(scriptName: string) {
    const scriptPath = Path.join(this.props.repositoryPath, scriptName)
    const child = spawn('bash', [scriptPath], {
      cwd: this.props.repositoryPath,
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
  }

  private onScriptsOverflowClick = () => {
    const { availableScripts } = this.state
    const availableUtilityScripts = UtilityScripts.filter(s => availableScripts.has(s.id))

    // Skip the first 3 that are shown as buttons
    const overflowScripts = availableUtilityScripts.slice(3)

    if (overflowScripts.length === 0) {
      return
    }

    const items: IMenuItem[] = overflowScripts.map(script => ({
      label: script.label,
      action: () => this.onScriptClick(script),
    }))

    showContextualMenu(items)
  }

  private onNewItemNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ newItemName: e.target.value })
  }

  private onNewItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      this.confirmCreate()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      this.cancelCreate()
    }
  }

  private onNewItemBlur = () => {
    // Small delay to allow click on confirm button to register
    setTimeout(() => {
      if (this.state.creatingType !== null && !this.state.newItemName.trim()) {
        this.cancelCreate()
      }
    }, 150)
  }

  private cancelCreate = () => {
    this.setState({ creatingType: null, newItemName: '' })
  }

  private confirmCreate = async () => {
    const { creatingType, newItemName } = this.state
    if (!creatingType || !newItemName.trim()) {
      this.cancelCreate()
      return
    }

    const itemPath = Path.join(this.props.repositoryPath, newItemName.trim())

    try {
      if (creatingType === 'file') {
        await fs.promises.writeFile(itemPath, '')
        this.refreshFileTree()
        this.props.onFileCreated?.(itemPath)
      } else {
        await fs.promises.mkdir(itemPath, { recursive: true })
        this.refreshFileTree()
      }
    } catch (e) {
      console.error(`Failed to create ${creatingType}:`, e)
    }

    this.setState({ creatingType: null, newItemName: '' })
  }

  private renderNewItemInput(): JSX.Element | null {
    const { creatingType, newItemName } = this.state
    if (!creatingType) return null

    const icon = creatingType === 'file' ? octicons.file : octicons.fileDirectoryFill
    const placeholder = creatingType === 'file' ? 'filename.ts' : 'folder-name'

    return (
      <div className="new-item-input-row">
        <Octicon symbol={icon} className="file-icon" />
        <input
          ref={this.newItemInputRef}
          type="text"
          className="new-item-input"
          value={newItemName}
          onChange={this.onNewItemNameChange}
          onKeyDown={this.onNewItemKeyDown}
          onBlur={this.onNewItemBlur}
          placeholder={placeholder}
          autoFocus
        />
        <button
          className="new-item-confirm"
          onClick={this.confirmCreate}
          title="Create"
        >
          <Octicon symbol={octicons.check} />
        </button>
        <button
          className="new-item-cancel"
          onClick={this.cancelCreate}
          title="Cancel"
        >
          <Octicon symbol={octicons.x} />
        </button>
      </div>
    )
  }

  private renderUtilityScriptsRow(): JSX.Element | null {
    const { creatingType, availableScripts } = this.state
    if (creatingType) return null

    const availableUtilityScripts = UtilityScripts.filter(s => availableScripts.has(s.id))
    if (availableUtilityScripts.length === 0) return null

    // Show first 3 as buttons, rest in overflow menu
    const visibleScripts = availableUtilityScripts.slice(0, 3)
    const hasOverflow = availableUtilityScripts.length > 3

    return (
      <div className="file-tree-scripts-row">
        {visibleScripts.map(script => (
          <button
            key={script.id}
            className="file-tree-script-button"
            onClick={() => this.onScriptClick(script)}
            title={`Run ${script.file}`}
          >
            <Octicon symbol={script.icon} />
            <span>{script.label}</span>
          </button>
        ))}
        {hasOverflow && (
          <button
            className="file-tree-script-button overflow-button"
            onClick={this.onScriptsOverflowClick}
            title="More scripts..."
          >
            <Octicon symbol={octicons.kebabHorizontal} />
          </button>
        )}
      </div>
    )
  }

  private renderDevScriptsRow(): JSX.Element | null {
    const { creatingType, availableScripts } = this.state
    if (creatingType) return null

    const availableDevScripts = DevScripts.filter(s => availableScripts.has(s.id))
    if (availableDevScripts.length === 0) return null

    return (
      <div className="file-tree-run-action">
        {availableDevScripts.map(script => (
          <button
            key={script.id}
            className={`file-tree-run-button ${script.className || ''}`}
            onClick={() => this.onScriptClick(script)}
            title={`Run ${script.file}`}
          >
            <Octicon symbol={script.icon} />
            <span>{script.label}</span>
          </button>
        ))}
      </div>
    )
  }

  public render() {
    const { tree, isLoading, creatingType } = this.state

    if (isLoading) {
      return (
        <div className="code-view-sidebar">
          <div className="loading">Loading files...</div>
        </div>
      )
    }

    if (!tree) {
      return (
        <div className="code-view-sidebar">
          <div className="no-files">Unable to load files</div>
        </div>
      )
    }

    return (
      <div className="code-view-sidebar" onContextMenu={this.onSidebarContextMenu}>
        <div className="file-tree">
          {this.renderNewItemInput()}
          {tree.children?.map(child => this.renderNode(child, 0))}
        </div>
        {this.renderUtilityScriptsRow()}
        {this.renderDevScriptsRow()}
        {!creatingType && (
          <div className="file-tree-actions">
            <button
              className="file-tree-action-button"
              onClick={this.onNewFileButtonClick}
              title="New File"
            >
              <Octicon symbol={octicons.plus} />
              <span>New File</span>
            </button>
            <button
              className="file-tree-action-button"
              onClick={this.onNewFolderButtonClick}
              title="New Folder"
            >
              <Octicon symbol={octicons.fileDirectoryFill} />
              <span>New Folder</span>
            </button>
            <button
              className="file-tree-action-button"
              onClick={this.props.onOpenTerminal}
              title="Open Terminal"
            >
              <Octicon symbol={octicons.terminal} />
              <span>Terminal</span>
            </button>
            {this.state.hasClaudeMd && (
              <button
                className="file-tree-action-button claude-button"
                onClick={this.props.onOpenClaude}
                title="Open Claude Code"
              >
                <Octicon symbol={octicons.copilot} />
                <span>Claude</span>
              </button>
            )}
          </div>
        )}
      </div>
    )
  }
}
