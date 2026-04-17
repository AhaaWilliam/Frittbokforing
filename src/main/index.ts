import { app, BrowserWindow, Menu, dialog, session } from 'electron'
import path from 'path'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { registerIpcHandlers } from './ipc-handlers'
import { getDb, closeDb } from './db'
import { createPreUpdateBackup } from './pre-update-backup'

// --- Crash handler (main process) ---
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error)
  try {
    dialog.showErrorBox(
      'Oväntat fel',
      'Ett oväntat fel uppstod. Appen kan behöva startas om.\n\n' +
        `Fel: ${error.message}\n\n` +
        'Loggen finns i: ~/Library/Logs/Fritt Bokföring/main.log',
    )
  } catch {
    // dialog kanske inte är tillgänglig om app inte initierats ännu
  }
})

// --- Auto-updater ---
function setupAutoUpdater(): void {
  autoUpdater.logger = log

  // Kör inte auto-updater i development eller E2E
  if (!app.isPackaged || process.env.E2E_TESTING === 'true') return

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    log.error('Auto-updater error:', err)
  })

  autoUpdater.on('update-available', () => {
    log.info('Uppdatering tillgänglig — laddar ner...')
  })

  autoUpdater.on('update-downloaded', () => {
    log.info('Uppdatering nedladdad — skapar backup och installerar')

    // KRITISKT: Backup INNAN install — skyddar bokföringsdata
    // om den nya versionens migration misslyckas
    try {
      createPreUpdateBackup()
    } catch (err) {
      // Avbryt uppdateringen — datasäkerhet går före att få in ny version
      const message = err instanceof Error ? err.message : String(err)
      log.error('Pre-update backup misslyckades, avbryter uppdatering:', err)
      dialog.showErrorBox(
        'Uppdateringen avbröts',
        'Uppdateringen avbröts eftersom säkerhetskopieringen av databasen misslyckades. ' +
          'Din nuvarande version fortsätter att fungera som vanligt.\n\n' +
          'Kontrollera att du har ledigt diskutrymme i ~/Documents/Fritt Bokföring/backups/ ' +
          'och att mappen är skrivbar, och försök sedan igen via Hjälp-menyn.\n\n' +
          `Felmeddelande: ${message}`,
      )
      return
    }

    dialog
      .showMessageBox({
        type: 'info',
        title: 'Uppdatering redo',
        message:
          'En ny version av Fritt Bokföring har laddats ner. Vill du starta om för att installera den?',
        buttons: ['Starta om', 'Senare'],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater fel:', err)
    // Tyst fel — stör inte användaren.
    // Utan code signing misslyckas signature verification — det är förväntat.
  })
}

// E2E: isolate userData (localStorage, cache, session) per test
if (process.env.E2E_USER_DATA) {
  app.setPath('userData', process.env.E2E_USER_DATA)
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Fritt Bokföring',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // Dev: ladda Vite dev server. Prod: ladda byggd HTML.
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // Custom meny utan Ctrl+N/S-bindningar (frigör shortcuts till renderer)
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Redigera',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Visa',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  // CSP — defense-in-depth for renderer
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
        ],
      },
    })
  })

  // Initiera DB tidigt — skapar filen och kör PRAGMA/migrationer
  getDb()
  registerIpcHandlers()
  createWindow()

  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDb()
})
