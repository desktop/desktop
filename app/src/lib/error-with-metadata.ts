export interface IErrorMetadata {
  /** Was the action which caused this error part of a background task? */
  readonly backgroundTask?: boolean
}

/** An error which contains additional metadata. */
export class ErrorWithMetadata extends Error {
  /** The error's metadata. */
  public readonly metadata: IErrorMetadata

  /** The underlying error to which the metadata is being attached. */
  public readonly underlyingError: Error

  public constructor(error: Error, metadata: IErrorMetadata) {
    super(error.message)

    this.name = error.name
    this.stack = error.stack
    this.underlyingError = error
    this.metadata = metadata
  }
}
