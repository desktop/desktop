export const coerceToBuffer = (
  value: string | Buffer,
  encoding: BufferEncoding = 'utf8'
) => (Buffer.isBuffer(value) ? value : Buffer.from(value, encoding))
