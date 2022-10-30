import { IShellInfo } from './shell-info'

export interface IFoundEditor<T> {
  readonly editor: T
  readonly path: string
  readonly usesShell?: boolean
  readonly shellInfo?: IShellInfo
}
