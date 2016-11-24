export interface IHTTPResponseNexus {
  statusCode: number,
  headers: { },
  body: { }
}

export function getHeader(response: IHTTPResponseNexus, key: string): string | null {
  const headers = <any>response.headers
  const header = headers[key]
  if (header) {
    // TODO: for now, we just give the first value
    const value: string = header[0]
    return value
  }
  return null
}