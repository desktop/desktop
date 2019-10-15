import { parseError } from '../../src/lib/squirrel-error-parser'

describe('parseError', () => {
  it('parses a missing Squirrel error', () => {
    // Source:
    // https://github.com/electron/electron/blob/ad90de0c822490664bdb3a3d265f4a0fce3f69de/lib/browser/api/auto-updater/auto-updater-win.js#L29
    const input = new Error('Can not find Squirrel')

    const output = parseError(input)

    expect(output).not.toBeNull()
  })

  it('parses a Squirrel network error', () => {
    // see https://github.com/desktop/desktop/issues/2288 for context
    const input = new Error(`Command failed: 4294967295
    System.AggregateException: One or more errors occurred. ---> System.Net.WebException: The remote name could not be resolved: 'central.github.com'
       at System.Net.HttpWebRequest.EndGetResponse(IAsyncResult asyncResult)
       at System.Net.WebClient.GetWebResponse(WebRequest request, IAsyncResult result)
       at System.Net.WebClient.DownloadBitsResponseCallback(IAsyncResult result)
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.Utility.<LogIfThrows>d__38\`1.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.FileDownloader.<DownloadUrl>d__3.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.ValidateEnd(Task task)
       at Squirrel.UpdateManager.CheckForUpdateImpl.<CheckForUpdate>d__2.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.UpdateManager.<CheckForUpdate>d__7.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.Update.Program.<Download>d__7.MoveNext()
       --- End of inner exception stack trace ---
       at System.Threading.Tasks.Task.ThrowIfExceptional(Boolean includeTaskCanceledExceptions)
       at System.Threading.Tasks.Task\`1.GetResultCore(Boolean waitCompletionNotification)
       at System.Threading.Tasks.Task\`1.get_Result()
       at Squirrel.Update.Program.executeCommandLine(String[] args)
       at Squirrel.Update.Program.main(String[] args)
       at Squirrel.Update.Program.Main(String[] args)
    ---> (Inner Exception #0) System.Net.WebException: The remote name could not be resolved: 'central.github.com'
       at System.Net.HttpWebRequest.EndGetResponse(IAsyncResult asyncResult)
       at System.Net.WebClient.GetWebResponse(WebRequest request, IAsyncResult result)
       at System.Net.WebClient.DownloadBitsResponseCallback(IAsyncResult result)
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.Utility.<LogIfThrows>d__38\`1.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.FileDownloader.<DownloadUrl>d__3.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.ValidateEnd(Task task)
       at Squirrel.UpdateManager.CheckForUpdateImpl.<CheckForUpdate>d__2.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.UpdateManager.<CheckForUpdate>d__7.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.Update.Program.<Download>d__7.MoveNext()<---
    `)

    const output = parseError(input)

    expect(output).not.toBeNull()
  })

  it('parses a timeout error', () => {
    const input = new Error(`Command failed: 4294967295
    System.AggregateException: One or more errors occurred. ---> System.Net.WebException: Unable to connect to the remote server ---> System.Net.Sockets.SocketException: A connection attempt failed because the connected party did not properly respond after a period of time, or established connection failed because connected host has failed to respond 54.82.67.239:443
       at System.Net.Sockets.Socket.EndConnect(IAsyncResult asyncResult)
       at System.Net.ServicePoint.ConnectSocketInternal(Boolean connectFailure, Socket s4, Socket s6, Socket& socket, IPAddress& address, ConnectSocketState state, IAsyncResult asyncResult, Exception& exception)
       --- End of inner exception stack trace ---
       at System.Net.HttpWebRequest.EndGetResponse(IAsyncResult asyncResult)
       at System.Net.WebClient.GetWebResponse(WebRequest request, IAsyncResult result)
       at System.Net.WebClient.DownloadBitsResponseCallback(IAsyncResult result)
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.Utility.<LogIfThrows>d__38\`1.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.FileDownloader.<DownloadUrl>d__3.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.ValidateEnd(Task task)
       at Squirrel.UpdateManager.CheckForUpdateImpl.<CheckForUpdate>d__2.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.UpdateManager.<CheckForUpdate>d__7.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.Update.Program.<Download>d__7.MoveNext()
       --- End of inner exception stack trace ---
       at System.Threading.Tasks.Task.ThrowIfExceptional(Boolean includeTaskCanceledExceptions)
       at System.Threading.Tasks.Task\`1.GetResultCore(Boolean waitCompletionNotification)
       at System.Threading.Tasks.Task\`1.get_Result()
       at Squirrel.Update.Program.executeCommandLine(String[] args)
       at Squirrel.Update.Program.main(String[] args)
       at Squirrel.Update.Program.Main(String[] args)
    ---> (Inner Exception #0) System.Net.WebException: Unable to connect to the remote server ---> System.Net.Sockets.SocketException: A connection attempt failed because the connected party did not properly respond after a period of time, or established connection failed because connected host has failed to respond 54.82.67.239:443
       at System.Net.Sockets.Socket.EndConnect(IAsyncResult asyncResult)
       at System.Net.ServicePoint.ConnectSocketInternal(Boolean connectFailure, Socket s4, Socket s6, Socket& socket, IPAddress& address, ConnectSocketState state, IAsyncResult asyncResult, Exception& exception)
       --- End of inner exception stack trace ---
       at System.Net.HttpWebRequest.EndGetResponse(IAsyncResult asyncResult)
       at System.Net.WebClient.GetWebResponse(WebRequest request, IAsyncResult result)
       at System.Net.WebClient.DownloadBitsResponseCallback(IAsyncResult result)
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.Utility.<LogIfThrows>d__38\`1.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.FileDownloader.<DownloadUrl>d__3.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.ValidateEnd(Task task)
       at Squirrel.UpdateManager.CheckForUpdateImpl.<CheckForUpdate>d__2.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.UpdateManager.<CheckForUpdate>d__7.MoveNext()
    --- End of stack trace from previous location where exception was thrown ---
       at System.Runtime.CompilerServices.TaskAwaiter.ThrowForNonSuccess(Task task)
       at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification(Task task)
       at Squirrel.Update.Program.<Download>d__7.MoveNext()<---`)

    const output = parseError(input)

    expect(output).not.toBeNull()
  })

  it('passes through an empty error', () => {
    const input = new Error()

    const output = parseError(input)

    expect(output).toBeNull()
  })
})
