import { uuid } from '../../lib/uuid'

const activeIds = new Set<string>()
const poolPrefix = '__'

function sanitizeId(id: string): string {
  // We're following the old HTML4 rules for ids for know
  // and we're explicitly not testing for a valid first
  // character since we have the poolPrefix which will
  // guarantee that.
  // See http://stackoverflow.com/a/79022/2114
  return id.replace(/[^a-z0-9\-_:.]+/gi, '_')
}

/**
 * Generate a unique id for an html element. The Id pool
 * maintains a list of used ids and if an id with a duplicate
 * prefix is already in use a counter value will be appended
 * to the generated id to maintain uniqueness.
 *
 * This method should be called from a component's
 * componentWillMount method and then released using the
 * releaseUniqueId method from the component's componentWillUnmount
 * method. The component should store the generated id in its
 * state for the lifetime of the component.
 *
 * @param prefix - A prefix used to distinguish components
 *                 or instances of components from each other.
 *                 At minimum a component should pass its own
 *                 name and ideally it should pass some other
 *                 form of semi-unique string directly related
 *                 to the currently rendering instance of that
 *                 component such as a friendly name (if such
 *                 a value exist. See TextBox for a good example).
 */
export function createUniqueId(prefix: string): string {
  if (__DEV__) {
    if (activeIds.size > 50) {
      console.warn(
        `Id pool contains ${activeIds.size} entries, it's possible that id's aren't being released properly.`
      )
    }
  }

  const safePrefix = sanitizeId(`${poolPrefix}${prefix}`)

  for (let i = 0; i < 100; i++) {
    const id = i > 0 ? `${safePrefix}_${i}` : safePrefix

    if (!activeIds.has(id)) {
      activeIds.add(id)
      return id
    }
  }

  // If we've failed to create an id 100 times it's likely
  // that we've either started using the id pool so widely
  // that 100 isn't enough at which point we should really
  // look into the root cause because that shouldn't be
  // necessary. In either case, let's just return a uuid
  // without storing it in the activeIds set because we
  // know it'll be unique.
  if (__DEV__) {
    console.warn(
      `Exhausted search for valid id for ${prefix}. Please investigate.`
    )
  }

  return uuid()
}

/**
 * Release a previously generated id such that it can be
 * reused by another component instance.
 */
export function releaseUniqueId(id: string) {
  activeIds.delete(id)
}
