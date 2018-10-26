import { Repository } from '../../models/repository'
import { IErrorMetadata, ErrorWithMetadata } from '../error-with-metadata'

/**
 * Create a handler for an operation that might fail, to wrap an asynchronous
 * operation and return a default value if the operation does not succeed
 *
 * @param repository the repository associated with the operation, so that the
 *                   error handling can provide context
 * @param emitError  the callback to fire to handle the error
 */
export function createFailableOperationHandler(
  repository: Repository,
  emitError: (error: Error) => void
) {
  return async function handleFailableOperation<T>(
    fn: () => Promise<T>,
    errorMetadata?: IErrorMetadata
  ): Promise<T | undefined> {
    try {
      const result = await fn()
      return result
    } catch (e) {
      e = new ErrorWithMetadata(e, {
        repository,
        ...errorMetadata,
      })

      emitError(e)
      return undefined
    }
  }
}
