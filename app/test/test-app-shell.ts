import { AppShell } from '../src/lib/dispatcher/app-shell'

import * as Fs from 'fs'

export class TestAppShell extends AppShell {
  public moveItemToTrash(path: string): boolean {
    Fs.unlinkSync(path)
    return true
  }
}
