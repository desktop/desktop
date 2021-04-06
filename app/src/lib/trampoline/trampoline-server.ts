import { createServer, AddressInfo, Server, Socket } from 'net'
import split2 from 'split2'
import { enableDesktopTrampoline } from '../feature-flag'
import { sendNonFatalException } from '../helpers/non-fatal-exception'
import { askpassTrampolineHandler } from './trampoline-askpass-handler'
import {
  ITrampolineCommand,
  TrampolineCommandHandler,
  TrampolineCommandIdentifier,
} from './trampoline-command'
import { TrampolineCommandParser } from './trampoline-command-parser'
import { isValidTrampolineToken } from './trampoline-tokens'

/**
 * This class represents the "trampoline server". The trampoline is something
 * we'll hand to git in order to communicate with Desktop without noticing. A
 * notable example of this would be GIT_ASKPASS.
 *
 * This server is designed so that it will start lazily when the app performs a
 * remote git operation. At that point, the app will try to retrieve the
 * server's port, which will run the server first if needed.
 *
 * The idea behind this is to simplify the retry approach in case of error:
 * instead of reacting to errors with an immediate retry, the server will remain
 * closed until the next time the app needs it (i.e. in the next git remote
 * operation).
 */
export class TrampolineServer {
  private readonly server: Server
  private listeningPromise: Promise<void> | null = null

  private readonly commandHandlers = new Map<
    TrampolineCommandIdentifier,
    TrampolineCommandHandler
  >()

  public constructor() {
    this.server = createServer(socket => this.onNewConnection(socket))

    // Make sure the server is always unref'ed, so it doesn't keep the app alive
    // for longer than needed. Not having this made the CI tasks on Windows
    // timeout because the unit tests completed in about 7min, but the test
    // suite runner would never finish, hitting a 45min timeout for the whole
    // GitHub Action.
    this.server.unref()

    this.registerCommandHandler(
      TrampolineCommandIdentifier.AskPass,
      askpassTrampolineHandler
    )
  }

  private async listen(): Promise<void> {
    if (!enableDesktopTrampoline()) {
      this.listeningPromise = Promise.resolve()
      return this.listeningPromise
    }

    this.listeningPromise = new Promise((resolve, reject) => {
      // Observe errors while trying to start the server
      this.server.on('error', error => {
        reject(error)
        this.close()
      })

      this.server.listen(0, '127.0.0.1', async () => {
        // Replace the error handler
        this.server.removeAllListeners('error')
        this.server.on('error', this.onServerError)

        resolve()
      })
    })

    return this.listeningPromise
  }

  private async close() {
    // Make sure the server is not trying to start
    if (this.listeningPromise !== null) {
      await this.listeningPromise
    }

    // Reset the server, it will be restarted lazily the next time it's needed
    this.server.close()
    this.server.removeAllListeners('error')
    this.listeningPromise = null
  }

  /**
   * This function will retrieve the port of the server, or null if the server
   * is not running.
   *
   * In order to get the server port, it might need to start the server if it's
   * not running already.
   */
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

    // Messages coming from the trampoline client will be separated by \0
    socket.pipe(split2(/\0/)).on('data', data => {
      this.onDataReceived(socket, parser, data)
    })

    socket.on('error', this.onClientError)
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

  /**
   * Registers a handler for commands with a specific identifier. This will be
   * invoked when the server receives a command with the given identifier.
   *
   * @param identifier Identifier of the command.
   * @param handler Handler to register.
   */
  private registerCommandHandler(
    identifier: TrampolineCommandIdentifier,
    handler: TrampolineCommandHandler
  ) {
    this.commandHandlers.set(identifier, handler)
  }

  private async processCommand(socket: Socket, command: ITrampolineCommand) {
    const token = command.environmentVariables.get('DESKTOP_TRAMPOLINE_TOKEN')

    if (token === undefined || !isValidTrampolineToken(token)) {
      throw new Error('Tried to use invalid trampoline token')
    }

    const handler = this.commandHandlers.get(command.identifier)

    if (handler === undefined) {
      socket.end()
      return
    }

    const result = await handler(command)

    if (result !== undefined) {
      socket.end(result)
    } else {
      socket.end()
    }
  }

  private onServerError = (error: Error) => {
    sendNonFatalException('trampolineServer', error)
    this.close()
  }

  private onClientError = (error: Error) => {
    sendNonFatalException('trampolineClient', error)
  }
}

export const trampolineServer = new TrampolineServer()
