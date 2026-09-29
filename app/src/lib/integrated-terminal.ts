/** Options for starting a shell in the integrated terminal. */
export interface IIntegratedTerminalOptions {
  /** The directory to start the shell in, null for the home directory. */
  readonly cwd: string | null
  readonly cols: number
  readonly rows: number
}
