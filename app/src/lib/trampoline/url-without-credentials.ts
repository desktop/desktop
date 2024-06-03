export function urlWithoutCredentials(remoteUrl: string): string {
  const url = new URL(remoteUrl)
  url.username = ''
  url.password = ''
  return url.toString()
}
