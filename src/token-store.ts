import * as keytar from 'keytar'

export default {
  setItem: function (key: string, login: string, value: string) {
    keytar.addPassword(key, login, value)
  },

  getItem: function (key: string, login: string): string {
    return keytar.getPassword(key, login)
  }
}
