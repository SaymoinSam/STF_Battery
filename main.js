var electron = require("electron"),
  app = electron.app,
  BrowserWindow = electron.BrowserWindow,
  Tray = electron.Tray,
  ipcMain = electron.ipcMain,
  path = require("path"),
  brightness = require('brightness'),
  exec = require("child_process").exec,
  AutoLaunch = require('auto-launch'),
  autoUpdater = require("electron-updater").autoUpdater,
  dialog = electron.dialog,
  win, tray, updateWin;

autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";

autoUpdater.autoDownload = false;

// change the icon of battery according to the level of the battery and whether is charging or not
// and set the tooltip of the tray icon to the level of the battery
function handleTrayIcon(data) {
  var icon = path.join(__dirname, "status-icons") + "/b" + Math.round(data.level * 10) +
    (data.isCharging ? "c" : "n") + ".ico";

  tray.setImage(icon);
  tray.setToolTip(Math.floor(data.level * 100) + "%");
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
function createTray() {
  // get the status-icons folder in both cases development and production, since this will get the path from asar too
  tray = new Tray(path.join(__dirname, "status-icons") + "/b10n.ico");

  tray.on("click", function(event, bounds) {
    // set the position of the window according to the position of the tray icon
    win.setBounds({
      width: 320,
      height: 220,
      x: bounds.x - 160,
      y: bounds.y - 210
    });
    win.show();
    win.webContents.send("battery-ischarging", "");
  });

  tray.on("right-click", function() {
    win.hide()
  });
}

function createWindow () {

  // Create the browser window.
  win = new BrowserWindow({
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    width: 320,
    height: 220,
    // to take the window away from the screen
    x: 5000,
    y: 5000,
    frame: false,
    resizable: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: true
    }
  })

  // and load the index.html of the app.
  win.loadFile('index.html')

  // hides the menu
  win.setMenu(null);

  win.on("blur", function() {
    win.hide();
  });

  win.on('closed', () => {
    // Dereference the window object
    win = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function() {
  createWindow();
  createTray();
  win.hide();

  ipcMain.on("battery-event", function(event, args) {
    handleTrayIcon(args);
  });

  ipcMain.on("brightness-get", function(event, isCharging) {
    // set the correct SettingIndex value according to the battery whether is charging or not
    var currentSettingIndex = isCharging ? "ACSettingIndex" : "DCSettingIndex";
    // get the ActivePowerScheme(current power plan) from windows registry
    exec('REG QUERY "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Power\\User\\PowerSchemes" /v "ActivePowerScheme"', (error, stdout, stderr) => {
      var currentPowerScheme = stdout.slice(stdout.indexOf("REG_SZ") + 6).trim();
      // get the current brightness level of the current power plan from windows registry
      exec(`REG QUERY "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Power\\User\\PowerSchemes\\${currentPowerScheme}\\7516b95f-f776-4464-8c53-06167f40cc99\\aded5e82-b909-4619-9949-f5d71dac0bcb" /v ${currentSettingIndex}`, (error, stdout, stderr) => {
        var brightnessValue = parseInt(stdout.slice(stdout.indexOf("0x")).trim());
        win.webContents.send("brightness-grab", brightnessValue);
      });
    });
  });

  electron.powerMonitor.on("resume", function() {
    win.reload();
  });

  ipcMain.on("brightness-set", function(event, val) {
    brightness.set(val / 100).then(() => {}).catch(() => {});
  });

  setTimeout(function() {
    autoUpdater.checkForUpdates();
    autoUpdater.on("update-available", function() {
      dialog.showMessageBox({
        type: "question",
        title: "STF Battery App Update",
        message: "A new version is avilable\nDo you want to update?",
        icon: path.join(__dirname, "build") + "/icon.ico",
        buttons: ["Update Now", "Later"]
      }).then(function(event) {
        if(event.response !== 0) {
          return;
        }
        updateWin = new BrowserWindow({
          icon: path.join(__dirname, "build") + "/icon.ico",
          minimizable: true,
          maximizable: false,
          closable: false,
          width: 270,
          height: 60,
          frame: false,
          resizable: false,
          transparent: true,
          alwaysOnTop: true,
          webPreferences: {
            nodeIntegration: true
          }
        });

        updateWin.loadFile('update.html');
        autoUpdater.downloadUpdate();
        updateWin.on('closed', () => {
          // Dereference the window object
          updateWin = null
        })
      }).catch(() => {});

      autoUpdater.on("download-progress", function(download) {
        updateWin.setProgressBar(download.percent / 100)
        updateWin.webContents.send("update-progress", download.percent);
        autoUpdater.logger.info(download.percent);
      });

      autoUpdater.on("update-downloaded", function() {
        updateWin.close();
        autoUpdater.quitAndInstall(true, true);
      });
    });
  }, 2000);

  ipcMain.on("minimize-update-win", function() {
    updateWin.minimize();
  });
  
  setInterval(function() {
    if(!win.isVisible()) {
      win.reload();
    }
  }, 1000 * 60);

  // adds the app to the startup of the system, so it starts with the system
  var autoLaunch = new AutoLaunch({
    name: 'battery_status',
    path: app.getPath('exe'),
  });

  autoLaunch.isEnabled().then((isEnabled) => {
    if(!isEnabled) {
      autoLaunch.enable();
    }
  });
})

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  app.quit()
})