import { spawn } from 'child_process'

type RegistryEntry = {
  name: string
  type: string
  value: string
}

const regPath = 'C:\\Windows\\System32\\reg.exe'

const ITEM_PATTERN = /^(.*)\s(REG_SZ|REG_MULTI_SZ|REG_EXPAND_SZ|REG_DWORD|REG_QWORD|REG_BINARY|REG_NONE)\s+([^\s].*)$/

export function readKeys(key: string): Promise<ReadonlyArray<RegistryEntry>> {
  return new Promise<ReadonlyArray<RegistryEntry>>((resolve, reject) => {
    const proc = spawn(regPath, ['QUERY', key], {
      cwd: undefined,
      env: process.env,
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
        const results = new Array<RegistryEntry>()
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
