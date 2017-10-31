import * as keytar from 'keytar'

function setItem(key: string, login: string, value: string) {
  return keytar.setPassword(key, login, value)
}

function getItem(key: string, login: string) {
  return keytar.getPassword(key, login)
}

function deleteItem(key: string, login: string) {
  return keytar.deletePassword(key, login)
}

export const TokenStore = {
  setItem,
  getItem,
  deleteItem,
}
