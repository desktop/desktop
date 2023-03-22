export interface IFoundEditor<T> {
  readonly editor: T
  readonly path: string
  readonly usesShell?: boolean
  readonly executableArgs?:
    | readonly string[]
    | ((path: string) => readonly string[] | undefined)
}
