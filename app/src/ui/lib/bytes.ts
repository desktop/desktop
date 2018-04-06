/**
 * Manipulate bytes for displaying purposes.
 */
export class Bytes {
  public readonly bytes: number

  public constructor(bytes: number) {
    this.bytes = bytes
  }

  /**
   * Display bytes in human readable format like:
   * - 23gb
   * - 43bytes
   * @param {boolean} forceSign Show `+123kb` instead of `123kb`
   * @return {string} formatted string
   */
  public format(forceSign: boolean = false) {
    if (!Number.isFinite(this.bytes)) {
      return 'Unknown'
    }
    const sizes = ['bytes', 'kb', 'mb', 'gb', 'tb']
    const i = Math.floor(Math.log(Math.abs(this.bytes)) / Math.log(1024))
    const sign = forceSign && this.bytes > 0 ? '+' : ''
    const value = Math.round(this.bytes / Math.pow(1024, i))
    return `${sign}${value}${sizes[i]}`
  }

  /**
   * Creates new Bytes object by adding or subtracting the bytes from
   * current instance.
   *
   * @param {number} bytes Amount of bytes to add/remove
   * @return {Bytes} New Bytes object.
   */
  public diff(bytes: number) {
    return new Bytes(bytes - this.bytes)
  }

  /**
   * Display difference percentage in comparison to provided number
   * of bytes.
   * @param {number} bytes Number of bytes.
   * @return {string} Percentage difference like 45%
   */
  public percentDiff(bytes: number) {
    const diff = Math.round(100 * (bytes - this.bytes) / this.bytes)
    return `${diff}%`
  }
}
