import {
  editors as WindowsEditors,
  WindowsExternalEditor,
} from '../../../src/lib/editors/win32'
import { getAvailableEditorsImpl } from '../../../src/lib/editors/win32'
import { RegistryValueType, RegistryValue } from 'registry-js'
import * as Path from 'path'

const BaseInstallLocation = Path.join(
  'C:',
  'Program Files',
  'My External Editor'
)

// Hardcoded path used to test editors which use `DisplayIcon`
const TestEditorExecutablePath = Path.join(BaseInstallLocation, 'editor.exe')

function enumerateRegistryValues(
  editor: WindowsExternalEditor
): ReadonlyArray<RegistryValue> {
  return [
    {
      name: 'DisplayName',
      type: RegistryValueType.REG_SZ,
      data: `${editor.displayNamePrefix} 5.0`,
    },
    {
      name: 'Publisher',
      type: RegistryValueType.REG_SZ,
      data: editor.publisher,
    },
    {
      name: editor.installLocationRegistryKey ?? 'InstallLocation',
      type: RegistryValueType.REG_SZ,
      data:
        editor.installLocationRegistryKey === 'DisplayIcon'
          ? TestEditorExecutablePath
          : BaseInstallLocation,
    },
  ]
}

function getExecutableShimPaths(
  editor: WindowsExternalEditor
): ReadonlyArray<string> {
  if (editor.installLocationRegistryKey === 'DisplayIcon') {
    return [TestEditorExecutablePath]
  }

  return editor.executableShimPaths.map(p =>
    Path.join(BaseInstallLocation, ...p)
  )
}

describe('Windows external editor detection', () => {
  describe('basic tests', () => {
    it('is finds no editors when there are no registry keys', async () => {
      const editors = await getAvailableEditorsImpl(
        (key, subKey) => {
          return []
        },
        (path: string) => Promise.resolve(true)
      )

      expect(editors).toHaveLength(0)
    })

    it('is finds no editors when there are registry keys but no files', async () => {
      const editors = await getAvailableEditorsImpl(
        (key, subKey) => {
          const editor = WindowsEditors.find(e =>
            e.registryKeys.some(rk => rk.key === key && rk.subKey === subKey)
          )
          if (editor === undefined) {
            return []
          }

          return enumerateRegistryValues(editor)
        },
        (path: string) => Promise.resolve(false)
      )

      expect(editors).toHaveLength(0)
    })

    it('is able to find all supported editors from the registry', async () => {
      const editors = await getAvailableEditorsImpl(
        (key, subKey) => {
          const editor = WindowsEditors.find(e =>
            e.registryKeys.some(rk => rk.key === key && rk.subKey === subKey)
          )
          if (editor === undefined) {
            return []
          }

          return enumerateRegistryValues(editor)
        },
        (path: string) => {
          const found = WindowsEditors.some(e =>
            getExecutableShimPaths(e).includes(path)
          )
          return Promise.resolve(found)
        }
      )

      // Check the length is the same
      expect(editors).toHaveLength(Object.entries(WindowsEditors).length)

      // Check all editors are actually there
      const foundEditorNames = new Set(editors.map(e => e.editor))
      const availableEditorNames = new Set(WindowsEditors.map(e => e.name))
      expect(foundEditorNames).toEqual(availableEditorNames)
    })

    it('is able to find all supported editors by all their known registry keys and executable paths', async () => {
      for (const editor of WindowsEditors) {
        const registryValues = enumerateRegistryValues(editor)
        const executableShimPaths = getExecutableShimPaths(editor)

        for (const executableShimPath of executableShimPaths) {
          for (const registryKeys of editor.registryKeys) {
            const editors = await getAvailableEditorsImpl(
              (key, subKey) => {
                if (
                  key !== registryKeys.key ||
                  subKey !== registryKeys.subKey
                ) {
                  return []
                }

                return registryValues
              },
              (path: string) => {
                return Promise.resolve(path === executableShimPath)
              }
            )

            expect(editors).toHaveLength(1)
            expect(editors[0].editor).toEqual(editor.name)
          }
        }
      }
    })
  })
})
