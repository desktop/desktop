import { ensureItemIds } from '../../../src/main-process/menu'

describe('main-process menu', () => {
  describe('ensureItemIds', () => {
    it('leaves explicitly specified ids', () => {
      const template: Electron.MenuItemConstructorOptions[] = [
        { label: 'File', id: 'foo' },
      ]

      ensureItemIds(template)

      expect(template[0].id).toBe('foo')
    })

    it('assigns ids to items which lack it', () => {
      const template: Electron.MenuItemConstructorOptions[] = [
        { label: 'File' },
      ]

      ensureItemIds(template)

      expect(template[0].id).toBe('@.File')
    })

    it('assigns ids recursively', () => {
      const template: Electron.MenuItemConstructorOptions[] = [
        {
          label: 'File',
          id: 'foo',
          submenu: [
            { label: 'Open' },
            { label: 'Close' },
            {
              label: 'More',
              submenu: [{ label: 'Even more' }],
            },
          ],
        },
      ]

      ensureItemIds(template)

      expect(template[0].id).toBe('foo')

      const firstSubmenu = template[0]
        .submenu! as Electron.MenuItemConstructorOptions[]

      expect(firstSubmenu[0].id).toBe('foo.Open')
      expect(firstSubmenu[1].id).toBe('foo.Close')
      expect(firstSubmenu[2].id).toBe('foo.More')

      const secondSubmenu = firstSubmenu[2]
        .submenu! as Electron.MenuItemConstructorOptions[]

      expect(secondSubmenu[0].id).toBe('foo.More.Even more')
    })

    it('handles duplicate generated ids', () => {
      const template: Electron.MenuItemConstructorOptions[] = [
        { label: 'foo' },
        { label: 'foo' },
      ]

      ensureItemIds(template)

      expect(template[0].id).toBe('@.foo')
      expect(template[1].id).toBe('@.foo1')
    })
  })
})
