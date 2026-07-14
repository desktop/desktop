# Documentation

## API

```typescript
import {
  initializeNotifications,
  DesktopNotification,
  terminateNotifications,
} from 'desktop-notifications'

// Initialize the notifications environment with the CLSID activator
initializeNotifications('{YOUR-TOAST-ACTIVATOR-CLSID-GOES-HERE}')

// ...

// Create and configure your notification
const notification = new DesktopNotification(
  'This is a title',
  'This is a body'
)

// Set a handler for click events
notification.onclick = () => {
  console.log('Hello world!')
}

// Then show it!
notification.show()

// ...

// Finally, clean up any resources used by the notifications environment
terminateNotifications()
```

## Setup

```shellsession
$ git clone https://github.com/desktop/desktop-notifications
$ cd desktop-notifications
$ yarn
```

As this project builds a native module, you'll need these dependencies along
with a recent version of Node:

- [Python 2.7](https://www.python.org/downloads/windows/)
  - _Let Python install into the default suggested path (`c:\Python27`),
    otherwise you'll have to configure node-gyp manually with the path which is
    annoying._
  - _Ensure the **Add python.exe to Path** option is selected._
- One of Visual Studio 2019, Visual C++ Build Tools or Visual Studio 2019
  - [Visual C++ Build Tools](https://visualstudio.microsoft.com/thank-you-downloading-visual-studio/?sku=BuildTools)
    - _Run `npm config set msvs_version 2019` to tell node to use this
      toolchain._
  - [Visual Studio 2019](https://www.visualstudio.com/vs/community/)
    - _Ensure you select the **Desktop development with C++** feature as that is
      required by Node.js for installing native modules._
    - _Run `npm config set msvs_version 2019` to tell node to use this
      toolchain._
  - **IMPORTANT:** Make sure to install Windows 10 SDK.
