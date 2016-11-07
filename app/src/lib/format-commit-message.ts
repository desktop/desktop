import { ICommitMessage } from './dispatcher/git-store'

export function formatCommitMessage(message: ICommitMessage) {
  let msg = message.summary
  if (message.description) {
    msg += `\n\n${message.description}`
  }

  return msg
}
