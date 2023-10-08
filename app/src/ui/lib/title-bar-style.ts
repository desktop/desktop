/**
 * This string enum represents the supported modes for rendering the title bar
 * in the app.
 *
 *  - 'native' - Use the default window style and chrome supported by the window
 *               manager
 *
 *  - 'custom' - Hide the default window style and chrome and display the menu
 *               provided by GitHub Desktop
 *
 * This is only available on the Linux build. For other operating systems this
 * is not configurable:
 *
 *  - macOS uses the native title bar
 *  - Windows uses the custom title bar
 */
export type TitleBarStyle = 'native' | 'custom'
