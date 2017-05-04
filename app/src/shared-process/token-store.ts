import * as keytar from 'keytar'

export function setItem(key: string, login: string, value: string) {
  return keytar.setPassword(key, login, value)
}

export function getItem(key: string, login: string) {
  return keytar.getPassword(key, login)
}

export function deleteItem(key: string, login: string) {
  return keytar.deletePassword(key, login)
}
