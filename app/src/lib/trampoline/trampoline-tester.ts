import { Socket } from 'net'
import split2 from 'split2'
import {
  TrampolineCommandHandler,
  TrampolineCommandIdentifier,
} from './trampoline-command'

const TrampolineTestString = 'It is alive!!!'

export const internalTestTrampolineHandler: TrampolineCommandHandler = async command => {
  // This handler just returns a hardcoded string that will be checked by the
  // test function.
  return TrampolineTestString
}

export async function testTrampoline(port: number, token: string) {
  const socket = new Socket()

  await new Promise<void>((resolve, reject) => {
    socket.on('error', reject)
    socket.connect(port, '127.0.0.1', resolve)
  })

  socket.removeAllListeners('error')

  // This is used as separator between elements
  const zero = new Uint8Array([0])

  // Number of parameters
  socket.write('0')
  socket.write(zero)

  // Number of environment variables
  socket.write('2')
  socket.write(zero)

  // Command identifier
  socket.write(
    `DESKTOP_TRAMPOLINE_IDENTIFIER=${TrampolineCommandIdentifier.InternalTest}`
  )
  socket.write(zero)

  // Trampoline token
  socket.write(`DESKTOP_TRAMPOLINE_TOKEN=${token}`)
  socket.write(zero)

  // Read the output of the server (coming from internalTestTrampolineHandler)
  const result = await new Promise<string>((resolve, reject) => {
    socket.on('error', reject)
    socket.pipe(split2(/\0/)).on('data', data => {
      resolve((data as Buffer).toString('utf8'))
    })
  })

  socket.removeAllListeners('error')

  socket.end()

  return result === TrampolineTestString
}
