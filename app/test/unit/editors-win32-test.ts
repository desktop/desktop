import assert from 'node:assert'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { describe, it, mock } from 'node:test'

import { createTempDirectory } from '../helpers/temp'

const HKEY_CURRENT_USER = 0
const HKEY_LOCAL_MACHINE = 1
const REG_SZ = 1

interface IRegistryLocation {
  readonly key: number
  readonly subKey: string
}

let registryLocation: IRegistryLocation | undefined
let rstudioPath = ''

mock.module('registry-js', {
  namedExports: {
    HKEY: {
      HKEY_CURRENT_USER,
      HKEY_LOCAL_MACHINE,
    },
    RegistryValueType: {
      REG_SZ,
    },
    enumerateKeys: () => [],
    enumerateValues: (key: number, subKey: string) => {
      if (key !== registryLocation?.key || subKey !== registryLocation.subKey) {
        return []
      }

      return [
        { name: 'DisplayName', type: REG_SZ, data: 'RStudio 2026.08.1' },
        { name: 'Publisher', type: REG_SZ, data: 'Posit Software' },
        { name: 'DisplayIcon', type: REG_SZ, data: `"${rstudioPath}",0` },
      ]
    },
  },
})

const uninstallSubKey =
  'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RStudio'
const wow64UninstallSubKey =
  'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RStudio'

const registryLocations: ReadonlyArray<
  readonly [name: string, location: IRegistryLocation]
> = [
  [
    'current-user uninstall registry',
    { key: HKEY_CURRENT_USER, subKey: uninstallSubKey },
  ],
  [
    '64-bit machine uninstall registry',
    { key: HKEY_LOCAL_MACHINE, subKey: uninstallSubKey },
  ],
  [
    '32-bit machine uninstall registry',
    { key: HKEY_LOCAL_MACHINE, subKey: wow64UninstallSubKey },
  ],
]

describe('Windows editor discovery', () => {
  for (const [name, location] of registryLocations) {
    it(`finds RStudio in the ${name}`, async t => {
      const directory = await createTempDirectory(t)
      rstudioPath = join(directory, 'rstudio.exe')
      registryLocation = location
      await writeFile(rstudioPath, '')

      const { getAvailableEditors } = await import(
        '../../src/lib/editors/win32'
      )
      const editors = await getAvailableEditors()

      assert.deepStrictEqual(editors, [
        { editor: 'RStudio', path: rstudioPath },
      ])
    })
  }
})
