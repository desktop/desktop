import * as Path from 'path'
import { CLIAction } from '../lib/cli-action'

type OpenRepositoryAction = Extract<CLIAction, { kind: 'open-repository' }>

interface IOpenRepositoryWindow {
  repositoryPath: string | null
  focus(): void
  revealAndFocus(): void
  sendCLIAction(action: OpenRepositoryAction): void
}

interface IRouteOpenRepositoryWindowContext {
  readonly getWindows: () => ReadonlyArray<IOpenRepositoryWindow>
  readonly onDidLoad: (fn: (window: IOpenRepositoryWindow) => void) => void
  readonly createWindow: (
    onWindowDidLoad: (window: IOpenRepositoryWindow) => void
  ) => IOpenRepositoryWindow
  readonly setPendingRepositoryPathForNextWindow: (path: string) => void
}

export function routeOpenRepositoryWindow(
  action: OpenRepositoryAction,
  context: IRouteOpenRepositoryWindowContext
) {
  const windows = context.getWindows()

  const existingWindow = windows.find(
    window =>
      window.repositoryPath !== null &&
      pathsMatch(window.repositoryPath, action.path)
  )

  if (existingWindow !== undefined) {
    existingWindow.revealAndFocus()
    return
  }

  const dispatchAction = (window: IOpenRepositoryWindow) => {
    window.repositoryPath = action.path
    window.sendCLIAction(action)
  }

  if (windows.length === 0) {
    context.setPendingRepositoryPathForNextWindow(action.path)
    context.onDidLoad(window => {
      window.focus()
      dispatchAction(window)
    })
    return
  }

  const window = context.createWindow(dispatchAction)
  window.repositoryPath = action.path
}

function pathsMatch(path1: string, path2: string) {
  // Windows is guaranteed to be case-insensitive so we can be a bit less strict
  const normalize = __WIN32__
    ? (path: string) => Path.normalize(path).toLowerCase()
    : (path: string) => Path.normalize(path)

  return normalize(path1) === normalize(path2)
}
