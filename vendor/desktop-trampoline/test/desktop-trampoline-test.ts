import { stat, access } from 'fs/promises'
import { constants } from 'fs'
import { execFile as execFileSync, ProcessEnvOptions } from 'child_process'
import { promisify } from 'util'
import {
  getDesktopAskpassTrampolinePath,
  getDesktopCredentialHelperTrampolinePath,
} from '../index'
import split2 from 'split2'
import { createServer } from 'net'
import assert from 'node:assert'
import { describe, it } from 'node:test'

const askPassTrampolinePath = getDesktopAskpassTrampolinePath()
const helperTrampolinePath = getDesktopCredentialHelperTrampolinePath()
const execFile = promisify(execFileSync)

function captureSession() {
  const output: string[] = []
  let resolveOutput: (value: string[]) => void

  const outputPromise = new Promise<string[]>(resolve => {
    resolveOutput = resolve
  })

  const server = createServer(socket => {
    let timeoutId: NodeJS.Timeout | null = null
    socket.pipe(split2(/\0/)).on('data', data => {
      output.push(data.toString('utf8'))

      // Hack: consider the session finished after 100ms of inactivity.
      // In a real-world scenario, you'd have to parse the data to know when
      // the session is finished.
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      timeoutId = setTimeout(() => {
        resolveOutput(output)
        socket.end()
        server.close()
      }, 100)
    })
  })

  const serverPortPromise = new Promise<number>((resolve, reject) => {
    server.on('error', e => reject(e))
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('Failed to get server address'))
        return
      }
      resolve(address.port)
    })
  })

  return {
    serverPortPromise,
    outputPromise,
  }
}

describe('desktop-trampoline', () => {
  it('exists and is a regular file', async () =>
    assert.equal((await stat(askPassTrampolinePath)).isFile(), true))

  it('can be executed by current process', async () =>
    await assert.doesNotReject(access(askPassTrampolinePath, constants.X_OK)))

  it('fails when required environment variables are missing', async () =>
    await assert.rejects(execFile(askPassTrampolinePath, ['Username'])))


  it('forwards arguments and valid environment variables correctly', async () => {
    const {serverPortPromise, outputPromise} = captureSession()
    const port = await serverPortPromise

    const env = {
      DESKTOP_TRAMPOLINE_TOKEN: '123456',
      DESKTOP_PORT: port.toString(),
      INVALID_VARIABLE: 'foo bar',
    }
    const opts: ProcessEnvOptions = { env }

    await execFile(askPassTrampolinePath, ['baz'], opts)

    const output = await outputPromise
    const outputArguments = output.slice(1, 2)
    assert.deepEqual(outputArguments, ['baz'])
    // output[2] is the number of env variables
    const envc = parseInt(output[2])
    const outputEnv = output.slice(3, 3 + envc)
    assert.equal(outputEnv.length, 2)
    assert.ok(outputEnv.includes('DESKTOP_TRAMPOLINE_TOKEN=123456'))
    assert.ok(outputEnv.includes('DESKTOP_TRAMPOLINE_IDENTIFIER=ASKPASS'))
  })

  it('forwards stdin when running in credential-helper mode', async () => {
    const { serverPortPromise, outputPromise } = captureSession()
    const port = await serverPortPromise

    const cp = execFile(helperTrampolinePath, ['get'], {
      env: { DESKTOP_PORT: port.toString() },
    })
    cp.child.stdin?.end('oh hai\n')

    await cp

    const output = await outputPromise
    assert.equal(output.at(-1), 'oh hai\n')
  })

  it("doesn't forward stdin when running in askpass mode", async () => {
    const { serverPortPromise, outputPromise } = captureSession()
    const port = await serverPortPromise

    const cp = execFile(askPassTrampolinePath, ['get'], {
      env: { DESKTOP_PORT: port.toString() },
    })
    cp.child.stdin?.end('oh hai\n')

    await cp

    const output = await outputPromise
    assert.equal(output.at(-1), '')
  })

  it('askpass handler ignores the DESKTOP_TRAMPOLINE_IDENTIFIER env var', async () => {
    const { serverPortPromise, outputPromise } = captureSession()
    const port = await serverPortPromise

    const cp = execFile(askPassTrampolinePath, ['get'], {
      env: { DESKTOP_PORT: port.toString(), DESKTOP_TRAMPOLINE_IDENTIFIER: 'foo' },
    })
    cp.child.stdin?.end('oh hai\n')

    await cp

    const output = await outputPromise
    const envc = parseInt(output[2])
    const outputEnv = output.slice(3, 3 + envc)
    assert.ok(outputEnv.includes('DESKTOP_TRAMPOLINE_IDENTIFIER=ASKPASS'))
  })

  it('credential handler ignores the DESKTOP_TRAMPOLINE_IDENTIFIER env var', async () => {
    const { serverPortPromise, outputPromise } = captureSession()
    const port = await serverPortPromise

    const cp = execFile(helperTrampolinePath, ['get'], {
      env: { DESKTOP_PORT: port.toString(), DESKTOP_TRAMPOLINE_IDENTIFIER: 'foo' },
    })
    cp.child.stdin?.end('oh hai\n')

    await cp

    const output = await outputPromise
    const envc = parseInt(output[2])
    const outputEnv = output.slice(3, 3 + envc)
    assert.ok(outputEnv.includes(
      'DESKTOP_TRAMPOLINE_IDENTIFIER=CREDENTIALHELPER'
    ))
  })
})
