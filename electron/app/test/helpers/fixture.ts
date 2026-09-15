import { join } from 'path'

export const getFixturePath = (...paths: string[]) =>
  join(__dirname, '..', 'fixtures', ...paths)
