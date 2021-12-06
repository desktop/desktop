export const ESC = '\u001b'
export const TimestampLength = 29
export const TimestampRegex = /^.{27}Z /gm
export const BrightClassPostfix = '-br'
// export for testing
// match characters that could be enclosing url to cleanly handle url formatting
export const UrlRegex = /([{(<[]*https?:\/\/[a-z0-9][a-z0-9-]*[a-z0-9]\.[^\s<>|'"]{2,})/gi

/**
 * Regex for matching ANSII escape codes
 * \u001b - ESC character
 * ?: Non-capturing group
 * (?:\u001b[) : Match ESC[
 * (?:[\?|#])??: Match also ? and # formats that we don't supports but want to eat our special characters to get rid of ESC character
 * (?:[0-9]{1,3})?: Match one or more occurrences of the simple format we want with out semicolon
 * (?:(?:;[0-9]{0,3})*)?: Match one or more occurrences of the format we want with semicolon
 */
// eslint-disable-next-line no-control-regex
export const _ansiEscapeCodeRegex = /(?:\u001b\[)(?:[?|#])?(?:(?:[0-9]{1,3})?(?:(?:;[0-9]{0,3})*)?[A-Z|a-z])/

/**
 * http://ascii-table.com/ansi-escape-sequences.php
 * https://en.wikipedia.org/wiki/ANSI_escape_code#3/4_bit
 * We support sequences of format:
 *  Esc[CONTENTHEREm
 *  Where CONTENTHERE can be of format: VALUE;VALUE;VALUE or VALUE
 *      Where VALUE is SGR parameter https://www.vt100.net/docs/vt510-rm/SGR
 *          We support: 0 (reset), 1 (bold), 3 (italic), 4 (underline), 22 (not bold), 23 (not italic), 24 (not underline), 38 (set fg), 39 (default fg), 48 (set bg), 49 (default bg),
 *                      fg colors - 30 (black), 31 (red), 32 (green), 33 (yellow), 34 (blue), 35 (magenta), 36 (cyan), 37 (white), 90 (grey)
 *                        with more brighness - 91 (red), 92 (green), 93 (yellow), 94 (blue), 95 (magenta), 96 (cyan), 97 (white)
 *                      bg colors - 40 (black), 41 (red), 42 (green), 43 (yellow), 44 (blue), 45 (magenta), 46 (cyan), 47 (white), 100 (grey)
 *                        with more brighness- 101 (red), 102 (green), 103 (yellow), 104 (blue), 105 (magenta), 106 (cyan), 107 (white)
 *  Where m refers to the "Graphics mode"
 *
 * 8-bit color is supported
 *  https://en.wikipedia.org/wiki/ANSI_escape_code#8-bit
 *  Esc[38;5;<n> To set the foreground color
 *  Esc[48;5;<n> To set the background color
 *  n can be from 0-255
 *  0-7 are standard colors that match the 4_bit color palette
 *  8-15 are high intensity colors that match the 4_bit high intensity color palette
 *  16-231 are 216 colors that cover the entire spectrum
 *  232-255 are grayscale colors that go from black to white in 24 steps
 *
 * 24-bit color is also supported
 *  https://en.wikipedia.org/wiki/ANSI_escape_code#24-bit
 *  Esc[38;2;<r>;<g>;<b> To set the foreground color
 *  Esc[48;2;<r>;<g>;<b> To set the background color
 *  Where r,g and b must be between 0-255
 */
