/* eslint-disable no-sync */

import * as temp from 'temp'
const _temp = temp.track()

export const mkdirSync = _temp.mkdirSync
export const openSync = _temp.openSync
