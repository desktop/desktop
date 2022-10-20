/*
These constants are put in place to mirror the styles in our variables.scss
so we have centralized place to update them if the css would change.

NB - Preferably we should dynamically find heights and widths of html elements
when possible to avoid the need to use static heights and widths.
*/

/** The app width for standard padding as defined in the 'variables.sccs' */
export const spacing = 10

/** Two times the app width for standard padding as defined in the
 * 'variables.sccs */
export const spacingDouble = spacing * 2

/** Four times the app width for standard padding as defined in the
 * 'variables.sccs */
export const spacingQuad = spacing * 4

/** Five times the app width for standard padding as defined in the
 * 'variables.sccs */
export const spacingQuint = spacing * 5
