import { lstatSync } from 'fs'

/**
 * Returns a value indicating whether or not a path is a directory
 */
export const pathIsDirectory = (path: string) => lstatSync(path).isDirectory()
