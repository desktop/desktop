import { stat } from 'fs/promises'

/**
 * Helper method to stat a path and check both that it exists and that it's
 * a directory.
 */
export const directoryExists = (path: string) =>
  stat(path)
    .catch(null)
    .then(s => s?.isDirectory() ?? false)
