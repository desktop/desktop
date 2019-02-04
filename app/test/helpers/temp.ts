/* eslint-disable no-sync */

/** Module for creating and managing temporary directories and files, using the
 * `temp` Node module
 */
import * as temp from 'temp'
const _temp = temp.track()

/**
 * Open a new temporary directory, specifying the prefix/suffix options the
 * directory should use
 */
export const mkdirSync = _temp.mkdirSync
/**
 * Open a new temporary file, specifying the prefix/suffix options the file
 * should use
 */
export const openSync = _temp.openSync
