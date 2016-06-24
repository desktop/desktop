import {ipcRenderer} from 'electron'
import guid from '../../lib/guid'

export default function send<T>(name: string, args: Object): Promise<T> {
  let resolve: (value: T) => void = null
  const promise = new Promise<T>((_resolve, reject) => {
    resolve = _resolve
  })

  const requestGuid = guid()
  ipcRenderer.once(`shared/response/${requestGuid}`, (event: any, args: any[]) => {
    resolve(args[0] as T)
  })

  ipcRenderer.send('shared/request', [{guid: requestGuid, name, args}])
  return promise
}
