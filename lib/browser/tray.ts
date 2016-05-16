import {Menu, Tray} from 'electron'

export default class TrayIcon {
  public load() {
      let platform = require('os').platform();
      let trayImage = "";
      let imageFolder = __dirname + '/../../static';

      // Determine appropriate icon for platform
      if (platform === 'darwin') {
          trayImage = imageFolder + '/iconDarkTemplate.png';
      }
      else if (platform === 'win32') {
          trayImage = imageFolder + '/icon-light.ico';
      }
      let appIcon = new Tray(trayImage);

      const contextMenu = Menu.buildFromTemplate([
        {label: 'About GitHub Client', checked: false},
        {type: 'separator'},
        {label: 'Options', submenu: [
          {label: 'Notifications', checked: true},
          {label: 'Accounts'},
          {label: 'Do a barrel roll'}
        ]},
        {label: 'Take me down', type: 'radio'},
        {label: 'To funky town', type: 'radio'},
        {label: 'Get funky', type: 'radio', checked: true},
        {label: 'Get down', type: 'radio'}
      ]);
      appIcon.setToolTip("GitHub Client");
      appIcon.setContextMenu(contextMenu);
  }
}
