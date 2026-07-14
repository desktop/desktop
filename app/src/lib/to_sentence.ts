/**
 * Converts the array to a comma-separated sentence where the last element is joined by the connector word
 *
 * Example output:
 *  [].to_sentence                      # => ""
 *  ['one'].to_sentence                 # => "one"
 *  ['one', 'two'].to_sentence          # => "one and two"
 *  ['one', 'two', 'three'].to_sentence # => "one, two, and three"
 *
 *   Based on https://gist.github.com/mudge/1076046 to emulate https://apidock.com/rails/Array/to_sentence
 */
export function toSentence(array: ReadonlyArray<string>): string {
  const wordsConnector = ', ',
    twoWordsConnector = ' and ',
    lastWordConnector = ', and '

  switch (array.length) {
    case 0:
      return ''
    case 1:
      return array.at(0) ?? ''
    case 2:
      return array.at(0) + twoWordsConnector + array.at(1)
    default:
      return (
        array.slice(0, -1).join(wordsConnector) +
        lastWordConnector +
        array.at(-1)
      )
  }
}
