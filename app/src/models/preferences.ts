export enum PreferencesTab {
  Accounts,
  Integrations,
  Git,
  Appearance,
  Editor,
  Notifications,
  Prompts,
  Advanced,
  Accessibility,
}

/** Available color themes for the code editor */
export enum EditorTheme {
  GitHubDark = 'github-dark',
  GitHubLight = 'github-light',
  Monokai = 'monokai',
  Dracula = 'dracula',
  OneDark = 'one-dark',
  SolarizedDark = 'solarized-dark',
  SolarizedLight = 'solarized-light',
  Nord = 'nord',
}

/** Default mode when opening files in the editor */
export enum EditorDefaultMode {
  ReadOnly = 'read-only',
  Edit = 'edit',
}

/** Mode lock behavior */
export enum EditorModeLock {
  None = 'none',
  ReadOnly = 'read-only',
  Edit = 'edit',
}

/** Editor settings configuration */
export interface IEditorSettings {
  /** Color theme for syntax highlighting */
  readonly theme: EditorTheme
  /** Font size in pixels */
  readonly fontSize: number
  /** Font family */
  readonly fontFamily: string
  /** Line height multiplier */
  readonly lineHeight: number
  /** Show line numbers */
  readonly showLineNumbers: boolean
  /** Show fold gutters */
  readonly showFoldGutters: boolean
  /** Default mode when opening files */
  readonly defaultMode: EditorDefaultMode
  /** Lock to a specific mode */
  readonly modeLock: EditorModeLock
  /** Tab size (number of spaces) */
  readonly tabSize: number
  /** Use spaces instead of tabs */
  readonly insertSpaces: boolean
  /** Enable word wrap */
  readonly wordWrap: boolean
  /** Auto-save delay in ms (0 to disable) */
  readonly autoSaveDelay: number
  /** Highlight active line */
  readonly highlightActiveLine: boolean
  /** Enable bracket matching */
  readonly bracketMatching: boolean
  /** Auto-close brackets */
  readonly autoCloseBrackets: boolean
  /** Enable search panel */
  readonly enableSearch: boolean
}

/** Default editor settings */
export const defaultEditorSettings: IEditorSettings = {
  theme: EditorTheme.GitHubDark,
  fontSize: 13,
  fontFamily: 'var(--font-family-monospace)',
  lineHeight: 1.5,
  showLineNumbers: true,
  showFoldGutters: true,
  defaultMode: EditorDefaultMode.ReadOnly,
  modeLock: EditorModeLock.None,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: false,
  autoSaveDelay: 1500,
  highlightActiveLine: true,
  bracketMatching: true,
  autoCloseBrackets: true,
  enableSearch: true,
}
