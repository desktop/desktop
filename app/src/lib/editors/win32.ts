import * as Path from 'path'
import { spawn } from 'child_process'
import { pathExists } from '../file-system'
import { ExternalEditor } from '../../models/editors'
import { LookupResult, FoundEditor } from './shared'

import { assertNever } from '../fatal-error'

// This is a stripped back version of winreg:
// https://github.com/fresc81/node-winreg
//
// I was seeing significant overhead when spawning the process to enumerate
// the keys found by `reg.exe`, and rather than trying to fix and potentially
// regress other parts I've extracted just the bit that I need to use.

const regPath = 'C:\\Windows\\System32\\reg.exe'

const ITEM_PATTERN = /^(.*)\s(REG_SZ|REG_MULTI_SZ|REG_EXPAND_SZ|REG_DWORD|REG_QWORD|REG_BINARY|REG_NONE)\s+([^\s].*)$/

interface IRegistryEntry {
  readonly name: string
  readonly type: string
  readonly value: string
}

function readRegistryKey(key: string): Promise<ReadonlyArray<IRegistryEntry>> {
  return new Promise<ReadonlyArray<IRegistryEntry>>((resolve, reject) => {
    const proc = spawn(regPath, ['QUERY', key], {
      cwd: undefined,
    })

    const buffers: Array<Buffer> = []
    let errorThrown = false
    proc.on('close', code => {
      if (errorThrown) {
        return
      } else if (code !== 0) {
        reject(`Unable to find registry key - exit code ${code} returned`)
      } else {
        const output = Buffer.concat(buffers).toString('utf8')
        const lines = output.split('\n')

        const items = []
        const results = new Array<IRegistryEntry>()
        let lineNumber = 0

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim()
          if (line.length > 0) {
            if (lineNumber !== 0) {
              items.push(line)
            }
            ++lineNumber
          }
        }

        for (let i = 0; i < items.length; i++) {
          const match = ITEM_PATTERN.exec(items[i])
          if (match) {
            const name = match[1].trim()
            const type = match[2].trim()
            const value = match[3]
            results.push({ name, type, value })
          }
        }

        resolve(results)
      }
    })

    proc.stdout.on('data', (data: Buffer) => {
      buffers.push(data)
    })

    proc.on('error', err => {
      errorThrown = true
      reject(err)
    })
  })
}

function getRegistryKey(editor: ExternalEditor): string {
  switch (editor) {
    case ExternalEditor.Atom:
      return 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\atom'
    case ExternalEditor.VisualStudioCode:
      return 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{F8A2A208-72B3-4D61-95FC-8A65D340689B}_is1'
    case ExternalEditor.SublimeText:
      return 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Sublime Text 3_is1'
    default:
      return assertNever(editor, `Unknown external editor: ${editor}`)
  }
}

function getExecutableShim(
  editor: ExternalEditor,
  installLocation: string
): string {
  switch (editor) {
    case ExternalEditor.Atom:
      return Path.join(installLocation, 'bin', 'atom.cmd')
    case ExternalEditor.VisualStudioCode:
      return Path.join(installLocation, 'bin', 'code.cmd')
    case ExternalEditor.SublimeText:
      return Path.join(installLocation, 'subl.exe')
    default:
      return assertNever(editor, `Unknown external editor: ${editor}`)
  }
}

function isExpectedInstallation(
  editor: ExternalEditor,
  displayName: string,
  publisher: string
): boolean {
  switch (editor) {
    case ExternalEditor.Atom:
      return displayName === 'Atom' && publisher === 'GitHub Inc.'
    case ExternalEditor.VisualStudioCode:
      return (
        displayName === 'Visual Studio Code' &&
        publisher === 'Microsoft Corporation'
      )
    case ExternalEditor.SublimeText:
      return (
        displayName === 'Sublime Text' && publisher === 'Sublime HQ Pty Ltd'
      )

    default:
      return assertNever(editor, `Unknown external editor: ${editor}`)
  }
}

function extractApplicationInformation(
  editor: ExternalEditor,
  keys: ReadonlyArray<IRegistryEntry>
): { displayName: string; publisher: string; installLocation: string } {
  let displayName = ''
  let publisher = ''
  let installLocation = ''

  if (editor === ExternalEditor.Atom) {
    for (const item of keys) {
      if (item.name === 'DisplayName') {
        displayName = item.value
      } else if (item.name === 'Publisher') {
        publisher = item.value
      } else if (item.name === 'InstallLocation') {
        installLocation = item.value
      }
    }

    return { displayName, publisher, installLocation }
  }

  if (
    editor === ExternalEditor.VisualStudioCode ||
    editor === ExternalEditor.SublimeText
  ) {
    for (const item of keys) {
      if (item.name === 'Inno Setup: Icon Group') {
        displayName = item.value
      } else if (item.name === 'Publisher') {
        publisher = item.value
      } else if (item.name === 'Inno Setup: App Path') {
        installLocation = item.value
      }
    }

    return { displayName, publisher, installLocation }
  }

  return assertNever(editor, `Unknown external editor: ${editor}`)
}

async function findApplication(editor: ExternalEditor): Promise<LookupResult> {
  const registryKey = getRegistryKey(editor)

  try {
    const keys = await readRegistryKey(registryKey)

    const {
      displayName,
      publisher,
      installLocation,
    } = extractApplicationInformation(editor, keys)

    if (!isExpectedInstallation(editor, displayName, publisher)) {
      log.debug(
        `Registry entry for ${editor} did not match expected publisher settings`
      )
      return {
        editor,
        installed: true,
        pathExists: false,
      }
    }

    const path = getExecutableShim(editor, installLocation)
    const exists = await pathExists(path)
    if (!exists) {
      log.debug(`Command line interface for ${editor} not found at '${path}'`)
      return {
        editor,
        installed: true,
        pathExists: false,
      }
    } else {
      return {
        editor,
        installed: true,
        pathExists: true,
        path,
      }
    }
  } catch (error) {}

  return { editor, installed: false }
}

/**
 * Lookup known external editors using the Windows registry to find installed
 * applications and their location on disk for Desktop to launch.
 */
export async function getAvailableEditors(): Promise<
  ReadonlyArray<FoundEditor>
> {
  const results: Array<FoundEditor> = []

  const [atom, code, sublime] = await Promise.all([
    findApplication(ExternalEditor.Atom),
    findApplication(ExternalEditor.VisualStudioCode),
    findApplication(ExternalEditor.SublimeText),
  ])

  if (atom.installed && atom.pathExists) {
    results.push({ editor: atom.editor, path: atom.path })
  }

  if (code.installed && code.pathExists) {
    results.push({ editor: code.editor, path: code.path })
  }

  if (sublime.installed && sublime.pathExists) {
    results.push({ editor: sublime.editor, path: sublime.path })
  }

  return results
}

/**
 * Find the first editor that exists on the user's machine, or return null if
 * no matches are found.
 */
export async function getFirstEditorOrDefault(): Promise<FoundEditor | null> {
  const atom = await findApplication(ExternalEditor.Atom)
  if (atom.installed && atom.pathExists) {
    return { editor: atom.editor, path: atom.path }
  }

  const code = await findApplication(ExternalEditor.VisualStudioCode)
  if (code.installed && code.pathExists) {
    return { editor: code.editor, path: code.path }
  }

  const sublime = await findApplication(ExternalEditor.SublimeText)
  if (sublime.installed && sublime.pathExists) {
    return { editor: sublime.editor, path: sublime.path }
  }

  return null
}
