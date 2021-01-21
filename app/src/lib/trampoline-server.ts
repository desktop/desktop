import { createServer, AddressInfo, Server, Socket } from 'net'
import split2 from 'split2'

class TrampolineCommand {
  private name: string | null = null
  private readonly parameters: string[] = []

  public getName() {
    return this.name
  }

  public getParameters(): ReadonlyArray<string> {
    return this.parameters
  }

  public addValue(value: string) {
    if (this.name === null) {
      this.name = value
    } else {
      this.parameters.push(value)
    }
  }
}

export type TrampolineCommandHandler = (
  parameters: ReadonlyArray<string>
) => Promise<string | undefined>

export class TrampolineServer {
  private readonly server: Server
  private listeningPromise: Promise<void> | null = null

  private readonly commandHandlers = new Map<string, TrampolineCommandHandler>()

  public constructor() {
    this.server = createServer(this.onNewConnection.bind(this))
  }

  public async run(): Promise<void> {
    await this.listen()

    // TODO: retry if it fails? crash the app instead?
  }

  private async listen(): Promise<void> {
    this.listeningPromise = new Promise((resolve, reject) => {
      function onListenError(error: Error) {
        reject(error)
      }

      this.server.on('error', onListenError)

      this.server.listen(0, 'localhost', async () => {
        this.server.off('error', onListenError)
        this.server.on('error', this.onErrorReceived)
        resolve()

        console.log(`Trampoline server port: ${await this.getPort()}`)
      })
    })

    return this.listeningPromise
  }

  public async getPort() {
    if (this.listeningPromise === null) {
      return null
    }

    await this.listeningPromise

    const address = this.server.address() as AddressInfo

    if (address && address.port) {
      return address.port
    }

    return null
  }

  private onNewConnection(socket: Socket) {
    socket
      .pipe(split2(/\0/))
      .on(
        'data',
        this.onDataReceived.bind(this, socket, new TrampolineCommand())
      )
  }

  private onDataReceived(
    socket: Socket,
    command: TrampolineCommand,
    data: Buffer
  ) {
    const value = data.toString('utf8')

    // TODO: Remove this. we should get \0s from the trampoline client
    // if (value.endsWith('\n')) {
    //   value = value.substr(0, value.length - 1)
    // }

    if (value.length === 0) {
      this.processCommand(socket, command)
    } else {
      command.addValue(value)
    }
  }

  public registerCommandHandler(
    name: string,
    handler: TrampolineCommandHandler
  ) {
    this.commandHandlers.set(name, handler)
  }

  private async processCommand(socket: Socket, command: TrampolineCommand) {
    console.log(
      `command '${command.getName()}' with arguments ${command.getParameters()}`
    )

    const name = command.getName()

    if (name === null) {
      return
    }

    const handler = this.commandHandlers.get(name)

    if (handler === undefined) {
      return
    }

    const result = await handler(command.getParameters())

    if (result !== undefined) {
      socket.end(result)
    }
  }

  private onErrorReceived(error: Error) {
    console.error('Error received in trampoline server:', error)
    // TODO: try to run the server again?
  }
}

export const trampolineServer = new TrampolineServer()
