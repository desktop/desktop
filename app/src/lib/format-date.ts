import mem from 'mem'

// Initializing a date formatter is expensive but formatting is relatively cheap
// so we cache them based on the locale and their options.
const getDateFormatter = mem(Intl.DateTimeFormat, {
  cacheKey: (...args) => JSON.stringify(args),
})

export const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) =>
  isNaN(date.valueOf())
    ? 'Invalid date'
    : getDateFormatter('en-US', options).format(date)
