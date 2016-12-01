import * as chai from 'chai'
const expect = chai.expect

import { ensureItemIds } from '../../../src/main-process/menu'

describe('main-process menu', () => {
  describe('ensureItemIds', () => {
    it('leaves explicitly specified ids', () => {
      const template: Electron.MenuItemOptions[] = [
        { label: 'File', id: 'foo' },
      ]

      ensureItemIds(template)

      expect(template[0].id).to.equal('foo')
    })

    it('assigns ids to items which lack it', () => {
      const template: Electron.MenuItemOptions[] = [ { label: 'File' } ]

      ensureItemIds(template)

      expect(template[0].id).to.equal('@.File')
    })

    it('assigns ids recursively', () => {
      const template: Electron.MenuItemOptions[] = [
        {
          label: 'File',
          id: 'foo',
          submenu: [
            { label: 'Open' },
            { label: 'Close' },
            {
              label: 'More',
              submenu: [
                { label: 'Even more' },
              ],
            },
          ],
        },
      ]

      ensureItemIds(template)

      expect(template[0].id).to.equal('foo')

      const firstSubmenu = template[0].submenu! as Electron.MenuItemOptions[]

      expect(firstSubmenu[0].id).to.equal('foo.Open')
      expect(firstSubmenu[1].id).to.equal('foo.Close')
      expect(firstSubmenu[2].id).to.equal('foo.More')

      const secondSubmenu = firstSubmenu[2].submenu! as Electron.MenuItemOptions[]

      expect(secondSubmenu[0].id).to.equal('foo.More.Even more')
    })

    it('handles duplicate generated ids', () => {
      const template: Electron.MenuItemOptions[] = [
        { label: 'foo' },
        { label: 'foo' },
      ]

      ensureItemIds(template)

      expect(template[0].id).to.equal('@.foo')
      expect(template[1].id).to.equal('@.foo1')
    })
  })
})
