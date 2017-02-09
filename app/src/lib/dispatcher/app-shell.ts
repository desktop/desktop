import { shell } from 'electron'

export class AppShell {
  public moveItemToTrash(path: string): boolean {
    return shell.moveItemToTrash(path)
  }
}
