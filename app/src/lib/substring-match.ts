/**
 * Every character index in `text` covered by a case-insensitive occurrence of
 * `query`, in the shape `HighlightText` expects.
 *
 * Overlapping starts are impossible for a literal needle, so each occurrence is
 * found from the end of the previous one.
 */
export function getSubstringMatchIndices(
  text: string,
  query: string
): ReadonlyArray<number> {
  const needle = query.trim().toLowerCase()

  if (needle.length === 0) {
    return []
  }

  const haystack = text.toLowerCase()
  const indices = new Array<number>()

  let from = haystack.indexOf(needle)

  while (from !== -1) {
    for (let i = from; i < from + needle.length; i++) {
      indices.push(i)
    }

    from = haystack.indexOf(needle, from + needle.length)
  }

  return indices
}
