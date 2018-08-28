/**
 * Insert a separator element between each entry of an array of elements
 *
 * @param elements
 * @param separator
 */
export function join(
  elements: JSX.Element[],
  separator: JSX.Element | string
): ReadonlyArray<JSX.Element | string> {
  if (elements.length === 0) {
    return []
  }

  if (elements.length === 1) {
    return elements
  }

  // build up the array by using a reducer
  const output = elements.reduce(
    (prev: Array<JSX.Element | string>, current: JSX.Element) => {
      return [...prev, current, separator]
    },
    []
  )

  // remove the last element from the generated list
  return output.slice(0, output.length - 1)
}
