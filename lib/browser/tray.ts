import {Menu, Tray} from 'electron'

export default class TrayIcon {
  public load() {
      let appIcon = new Tray(`${__dirname}/../../static/GitHub-Mark-16px.png`);
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
      console.log('tray', "There should be a tray icon!");
  }
}
