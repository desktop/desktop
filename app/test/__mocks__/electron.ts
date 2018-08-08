export const shell = {
  moveItemToTrash: jest.fn(),
}

export const remote = {
  getCurrentWindow: jest.fn(),
  autoUpdater: {
    on: jest.fn(),
  },
}
