import { editors as WindowsEditors } from '../../../src/lib/editors/win32'
import { getAvailableEditorsImpl } from '../../../src/lib/editors/win32'
import { RegistryValueType } from 'registry-js'
import * as Path from 'path'

const BaseInstallLocation = Path.join(
  'C:',
  'Program Files',
  'My External Editor'
)

// Hardcoded path used to test editors which use `DisplayIcon`
const TestEditorExecutablePath = Path.join(BaseInstallLocation, 'editor.exe')

describe('Windows external editor detection', () => {
  describe('basic tests', () => {
    it('is able to find all supported editors from the registry', async () => {
      const editors = await getAvailableEditorsImpl(
        (key, subKey) => {
          const editor = WindowsEditors.find(e =>
            e.registryKeys.some(rk => rk.key === key && rk.subKey === subKey)
          )
          if (editor === undefined) {
            return []
          }

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
        },
        (path: string) => {
          return Promise.resolve(
            WindowsEditors.some(e => {
              if (e.installLocationRegistryKey === 'DisplayIcon') {
                return path === TestEditorExecutablePath
              }

              return e.executableShimPaths.some(
                p => Path.join(BaseInstallLocation, ...p) === path
              )
            })
          )
        }
      )

      expect(editors).toHaveLength(Object.entries(WindowsEditors).length)
    })
  })
})
