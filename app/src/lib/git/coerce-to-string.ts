export const coerceToString = (
  value: string | Buffer,
  encoding: BufferEncoding = 'utf8'
) => (Buffer.isBuffer(value) ? value.toString(encoding) : value)
