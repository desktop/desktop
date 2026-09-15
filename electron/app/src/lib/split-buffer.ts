export function splitBuffer(buffer: Buffer, delimiter: string): Buffer[] {
  const result = []
  let start = 0
  let index = buffer.indexOf(delimiter, start)
  while (index !== -1) {
    result.push(buffer.subarray(start, index))
    start = index + delimiter.length
    index = buffer.indexOf(delimiter, start)
  }
  if (start <= buffer.length) {
    result.push(buffer.subarray(start))
  }
  return result
}
