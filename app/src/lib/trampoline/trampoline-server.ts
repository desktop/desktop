import { createServer, AddressInfo, Server, Socket } from 'net'
import split2 from 'split2'
import { enableDesktopTrampoline } from '../feature-flag'
import {
  ITrampolineCommand,
  TrampolineCommandHandler,
} from './trampoline-command'
import { TrampolineCommandParser } from './trampoline-command-parser'
import { isValidTrampolineToken } from './trampoline-tokens'

export class TrampolineServer {
  private readonly server: Server
  private listeningPromise: Promise<void> | null = null

  private readonly commandHandlers = new Map<string, TrampolineCommandHandler>()

  public constructor() {
    this.server = createServer(socket => this.onNewConnection(socket))
  }

  private async listen(): Promise<void> {
    if (!enableDesktopTrampoline()) {
      this.listeningPromise = Promise.resolve()
      return this.listeningPromise
    }

    this.listeningPromise = new Promise((resolve, reject) => {
      this.server.on('error', error => {
        reject(error)
        this.close()
      })

      this.server.listen(0, '127.0.0.1', async () => {
        this.server.removeAllListeners('error')
        this.server.on('error', error => this.onErrorReceived(error))

        resolve()

        console.log(`Trampoline server port: ${await this.getPort()}`)
      })
    })

    return this.listeningPromise
  }

  private async close() {
    if (this.listeningPromise !== null) {
      await this.listeningPromise
    }
    // Reset the server, it will be restarted lazily the next time it's needed
    this.server.close()
    this.server.removeAllListeners('error')
    this.listeningPromise = null
  }

  public async getPort() {
    if (this.port !== null) {
      return this.port
    }

    if (this.listeningPromise !== null) {
      await this.listeningPromise
    } else {
      await this.listen()
    }

    return this.port
  }

  private get port(): number | null {
    const address = this.server.address() as AddressInfo

    if (address && address.port) {
      return address.port
    }

    return null
  }

  private onNewConnection(socket: Socket) {
    const parser = new TrampolineCommandParser()
    socket.pipe(split2(/\0/)).on('data', data => {
      this.onDataReceived(socket, parser, data)
    })
  }

  private onDataReceived(
    socket: Socket,
    parser: TrampolineCommandParser,
    data: Buffer
  ) {
    const value = data.toString('utf8')
    parser.processValue(value)

    if (parser.hasFinished()) {
      this.processCommand(socket, parser.toCommand())
    }
  }

  public registerCommandHandler(
    identifier: string,
    handler: TrampolineCommandHandler
  ) {
    this.commandHandlers.set(identifier, handler)
  }

  private async processCommand(socket: Socket, command: ITrampolineCommand) {
    const token = command.environmentVariables.get('DESKTOP_TRAMPOLINE_TOKEN')

    if (token === undefined || !isValidTrampolineToken(token)) {
      console.error('Tried to use invalid trampoline token')
      return
    }

    const handler = this.commandHandlers.get(command.identifier)

    if (handler === undefined) {
      return
    }

    const result = await handler(command)

    if (result !== undefined) {
      socket.end(result)
    }
  }

  private onErrorReceived(error: Error) {
    console.error('Error received in trampoline server:', error)

    this.close()
  }
}

export const trampolineServer = new TrampolineServer()
