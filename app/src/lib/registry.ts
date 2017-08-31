import * as Path from 'path'
import { spawn } from 'child_process'

// This is a stripped back version of winreg:
// https://github.com/fresc81/node-winreg
//
// I was seeing significant overhead when spawning the process to enumerate
// the keys found by `reg.exe`, and rather than trying to fix and potentially
// regress other parts I've extracted just the bit that I need to use.

const windir = process.env.windir || 'C:\\Windows'
const regPath = Path.join(windir, 'System32', 'reg.exe')

const ITEM_PATTERN = /^(.*)\s(REG_SZ|REG_MULTI_SZ|REG_EXPAND_SZ|REG_DWORD|REG_QWORD|REG_BINARY|REG_NONE)\s+([^\s].*)$/

export interface IRegistryEntry {
  readonly name: string
  readonly type: string
  readonly value: string
}

/**
 * Read registry keys found at the expected location.
 *
 * This method will return an empty list if the expected key does not exist,
 * instead of throwing an error.
 *
 * @param key The registry key to lookup
 */
export function readRegistryKeySafe(
  key: string
): Promise<ReadonlyArray<IRegistryEntry>> {
  return new Promise<ReadonlyArray<IRegistryEntry>>((resolve, reject) => {
    const proc = spawn(regPath, ['QUERY', key], {
      cwd: undefined,
    })

    const buffers: Array<Buffer> = []
    let errorThrown = false
    proc.on('close', code => {
      if (errorThrown) {
        resolve([])
      } else if (code !== 0) {
        log.debug(`Unable to find registry key - exit code ${code} returned`)
        resolve([])
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
      log.debug('An error occurred while trying to find the program', err)
    })
  })
}
