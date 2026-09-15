import { Author, isKnownAuthor } from '../../../models/author'

export function getFullTextForAuthor(author: Author) {
  if (isKnownAuthor(author)) {
    return author.username === null
      ? author.name
      : `@${author.username} (${author.name})`
  } else {
    return `@${author.username}`
  }
}

export function getDisplayTextForAuthor(author: Author) {
  if (isKnownAuthor(author)) {
    return author.username === null ? author.name : `@${author.username}`
  } else {
    return `@${author.username}`
  }
}
