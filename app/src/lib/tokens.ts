export interface IToken {
  length: number
  token: string
}

export interface ITokens {
  [line: number]: { [startIndex: number]: IToken }
}
