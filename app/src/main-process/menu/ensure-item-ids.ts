function getItemId(template: Electron.MenuItemConstructorOptions) {
  return template.id || template.label || template.role || 'unknown'
}

/**
 * Ensures that all menu items in the given template are assigned an id
 * by recursively traversing the template and mutating items in place.
 *
 * Items which already have an id are left alone, the other get a unique,
 * but consistent id based on their label or role and their position in
 * the menu hierarchy.
 *
 * Note that this does not do anything to prevent the case where items have
 * explicitly been given duplicate ids.
 */
export function ensureItemIds(
  template: ReadonlyArray<Electron.MenuItemConstructorOptions>,
  prefix = '@',
  seenIds = new Set<string>()
) {
  for (const item of template) {
    let counter = 0
    let id = item.id

    // Automatically generate an id if one hasn't been explicitly provided
    if (!id) {
      // Ensure that multiple items with the same key gets suffixed with a number
      // i.e. @.separator, @.separator1 @.separator2 etc
      do {
        id = `${prefix}.${getItemId(item)}${counter++ || ''}`
      } while (seenIds.has(id))
    }

    item.id = id
    seenIds.add(id)

    if (item.submenu) {
      const subMenuTemplate = item.submenu as ReadonlyArray<
        Electron.MenuItemConstructorOptions
      >
      ensureItemIds(subMenuTemplate, item.id, seenIds)
    }
  }
}
