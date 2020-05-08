export const shell = {
  moveItemToTrash: jest.fn(),
}

export const remote = {
  app: {
    on: jest.fn(),
  },
  getCurrentWindow: jest.fn().mockImplementation(() => ({
    isFullScreen: jest.fn().mockImplementation(() => true),
    webContents: {
      getZoomFactor: jest.fn().mockImplementation(_ => null),
    },
  })),
  autoUpdater: {
    on: jest.fn(),
  },
  nativeTheme: {
    addListener: jest.fn(),
    removeAllListeners: jest.fn(),
    shouldUseDarkColors: jest.fn().mockImplementation(() => true),
  },
}

export const ipcRenderer = {
  on: jest.fn(),
  send: jest.fn(),
}
