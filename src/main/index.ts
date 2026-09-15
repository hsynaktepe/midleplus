import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { DatabaseService } from './services/database';
import { FarmingEngine } from './services/farmingEngine';
import { LootService } from './services/lootService';
import { MarketService } from './services/marketService';
import { ProfitService } from './services/profitService';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let db: DatabaseService;
let engine: FarmingEngine;
let isAppQuitting = false;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function openSafeExternalUrl(targetUrl: string): void {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol === 'https:' || (isDev && parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'))) {
      shell.openExternal(targetUrl);
    }
  } catch {
    // Malformed or dangerous URL ignored
  }
}

// Global safety handler for expected network/session handover events
process.on('unhandledRejection', (reason: any) => {
  const isSessionReplaced = reason?.message?.includes?.('LogonSessionReplaced') || reason?.eresult === 34;
  if (isSessionReplaced) {
    console.warn('[Process] Yakalanan beklenen Steam oturum devri (LogonSessionReplaced).');
    return;
  }
  console.warn('[Process] Unhandled Rejection:', reason?.message || reason);
});

function getAppIconPath(): string | undefined {
  const possiblePaths = [
    path.join(__dirname, '../../build/icon.ico'),
    path.join(__dirname, '../build/icon.ico'),
    path.join(app.getAppPath(), 'build/icon.ico'),
    path.join(process.resourcesPath, 'build/icon.ico'),
    path.join(process.cwd(), 'build/icon.ico'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function createWindow(): void {
  const appIcon = getAppIconPath();

  mainWindow = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 980,
    minHeight: 640,
    frame: false, // Custom frameless modern titlebar
    backgroundColor: '#0b0e14',
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Navigation & window security: prevent arbitrary web pages from opening inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openSafeExternalUrl(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (isDev && (parsed.origin === 'http://localhost:5173' || (process.env.VITE_DEV_SERVER_URL && navigationUrl.startsWith(process.env.VITE_DEV_SERVER_URL)))) {
        return; // allow dev server
      }
    } catch {
      // invalid URL
    }
    event.preventDefault();
    openSafeExternalUrl(navigationUrl);
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (isDev) {
    // Only in dev mode fallback to local Vite port
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow?.loadFile(path.join(__dirname, '../renderer/index.html'));
    });
  } else {
    // In production, strictly load local packaged HTML file — prevents port-hijacking
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('close', (event) => {
    const settings = db.getSettings();
    if (settings.minimizeToTray && !isAppQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray(): void {
  const trayIconPath = getAppIconPath();
  const icon = trayIconPath
    ? nativeImage.createFromPath(trayIconPath)
    : nativeImage.createFromBuffer(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAExJREFUOE9jZKAQMFKon2HUAAYGBoa/f/8yMDIyMhDXiM+fP/9nZGRkgmrEJodVA0YNGBj9QKp74fL/PwMDI/F+AOkHYvQzDM4uEBoA5T0u60rB07oAAAAASUVORK5CYII=',
        'base64'
      )
    );

  tray = new Tray(icon);
  tray.setToolTip('Mega Idle Plus');

  const updateMenu = () => {
    const status = engine.getStatus();
    const isEn = db.getSettings().language === 'en';
    const statusText = status.isFarming
      ? status.isPaused
        ? (isEn ? 'Paused' : 'Duraklatıldı')
        : (isEn ? 'Farming' : 'Çalışıyor')
      : (isEn ? 'Idle' : 'Beklemede');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `${isEn ? 'Status' : 'Durum'}: ${statusText}`,
        enabled: false,
      },
      {
        label: `${isEn ? 'Cards Remaining' : 'Kalan Kart'}: ${status.totalCardsRemaining}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: status.isFarming
          ? (isEn ? 'Stop Farming' : 'Kart Düşürmeyi Durdur')
          : (isEn ? 'Start Farming' : 'Kart Düşürmeyi Başlat'),
        click: () => {
          if (status.isFarming) engine.stopFarming();
          else engine.startFarming();
        },
      },
      {
        label: isEn ? 'Show Window' : 'Pencereyi Göster',
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      { type: 'separator' },
      {
        label: isEn ? 'Quit' : 'Çıkış Yap',
        click: () => {
          isAppQuitting = true;
          app.quit();
        },
      },
    ]);
    tray?.setContextMenu(contextMenu);
  };

  updateMenu();
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  engine.on('statusChanged', updateMenu);
}

// Global Single Instance Lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Security: Deny all permission requests from web content (camera, microphone, geolocation etc.)
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.setPermissionCheckHandler(() => false);

    // Security: Block any creation of webview tags
    app.on('web-contents-created', (_, contents) => {
      contents.on('will-attach-webview', (event) => {
        event.preventDefault();
      });
    });

    db = new DatabaseService();
    engine = new FarmingEngine(db);

    createWindow();
    createTray();

    setupIPCHandlers();

    // Event broadcasts to renderer
    engine.on('statusChanged', (status) => {
      mainWindow?.webContents.send('farming:statusChanged', status);
    });

    engine.on('cardDropped', (drop) => {
      mainWindow?.webContents.send('farming:cardDropped', drop);
    });

    engine.on('logAdded', (log) => {
      mainWindow?.webContents.send('logs:added', log);
    });

    engine.on('queueUpdated', (queue) => {
      mainWindow?.webContents.send('queue:updated', queue);
    });

    engine.steamClient.on('qrAuthenticated', (data) => {
      db.saveAccount({
        id: data.steamID,
        accountName: data.accountName || 'Steam Hesabı',
        loginType: 'qr',
        mode: 'standalone',
        rawToken: data.refreshToken,
        isActive: true,
      });

      const isEn = db.getSettings().language === 'en';
      const log = db.addLog({
        level: 'success',
        message: isEn
          ? `🎉 [${data.accountName || data.steamID}] logged in successfully via Steam Mobile QR code!`
          : `🎉 [${data.accountName || data.steamID}] hesabı Steam Mobil QR kodu ile başarıyla bağlandı!`,
        accountId: data.steamID,
      });

      mainWindow?.webContents.send('logs:added', log);
      mainWindow?.webContents.send('accounts:updated', db.getAccounts());
    });

    engine.steamClient.on('error', (err: any) => {
      const isEn = db.getSettings().language === 'en';
      const msg = err?.message || String(err);
      engine.log('error', isEn ? `Steam connection error: ${msg}` : `Steam bağlantı hatası: ${msg}`);

      // refreshToken geçersiz hatası
      const isTokenError = msg.includes('refreshToken is not a Steam refresh token') || msg.includes('not a Steam refresh token');
      // profile private hatası
      const isPrivateProfile = msg.toLowerCase().includes('profile is private');
      // Oturum başka cihazda açıldı (LogonSessionReplaced)
      const isSessionReplaced = msg.includes('LogonSessionReplaced') || err?.eresult === 34;

      const alertId = `steam-err-${Date.now()}`;
      let titleKey = 'steamAlert.errorTitle';
      let messageKey = 'steamAlert.errorGeneric';
      let alertType: 'error' | 'warn' = 'error';

      if (isSessionReplaced) {
        titleKey = 'steamAlert.sessionReplacedTitle';
        messageKey = 'steamAlert.sessionReplacedMsg';
        alertType = 'warn';
      } else if (isTokenError) {
        titleKey = 'steamAlert.tokenErrorTitle';
        messageKey = 'steamAlert.tokenErrorMsg';
      } else if (isPrivateProfile) {
        titleKey = 'steamAlert.privateProfileTitle';
        messageKey = 'steamAlert.privateProfileMsg';
      }

      mainWindow?.webContents.send('steam:alert', {
        id: alertId,
        type: alertType,
        titleKey,
        messageKey,
        rawMessage: msg,
        timestamp: new Date().toISOString(),
      });
    });

    engine.steamClient.on('disconnected', ({ eresult, msg }: any) => {
      const isEn = db.getSettings().language === 'en';
      engine.log(
        'warn',
        isEn
          ? `Steam connection lost (${msg || eresult || 'Unknown'}).`
          : `Steam bağlantısı koptu (${msg || eresult || 'Bilinmiyor'}).`
      );
      mainWindow?.webContents.send('steam:alert', {
        id: `steam-disc-${Date.now()}`,
        type: 'warn',
        titleKey: 'steamAlert.disconnectedTitle',
        messageKey: 'steamAlert.disconnectedMsg',
        rawMessage: msg || String(eresult || ''),
        timestamp: new Date().toISOString(),
      });
    });

    // Auto-connect to Steam CM on app start if active standalone account exists
    setTimeout(async () => {
      try {
        await engine.ensureConnectedToSteam();
      } catch (e) {
        console.warn('Startup Steam connection check failed:', e);
      }
    }, 1500);

    // Başlangıçta loginType/mode tutarsızlıklarını düzelt
    const allAccounts = db.getAccounts();
    for (const acc of allAccounts) {
      if (acc.loginType === 'cookie' && acc.mode !== 'local_client') {
        db.saveAccount({ id: acc.id, mode: 'local_client' });
        console.log(`[Migration] ${acc.accountName}: cookie → local_client moda düzeltildi`);
      }
    }

    // Başlangıçta aktif hesabın rozet ve kalan kart haklarını arka planda tazele
    setTimeout(async () => {
      try {
        const accounts = db.getAccounts();
        const activeAcc = accounts.find((a) => a.isActive) || accounts[0];
        if (activeAcc) {
          const rawToken = db.getAccountToken(activeAcc.id);
          if (rawToken) {
            console.log(`[Startup] Arka planda rozet ve kalan kart sayısı kontrol ediliyor: ${activeAcc.accountName}`);
            await engine.fetchAndSaveBadges(activeAcc.id, rawToken);
            mainWindow?.webContents.send('queue:updated', db.getQueue(activeAcc.id));
          }
        }
      } catch (e) {
        console.warn('Startup badge refresh check failed:', e);
      }
    }, 3000);

    db.addLog({
      level: 'info',
      message: 'Mega Idle Plus (Midle+) v1.0 başlatıldı ve hazır.',
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    const settings = db.getSettings();
    if (!settings.minimizeToTray) {
      app.quit();
    }
  }
});

function sanitizeErrorMessage(msg: any): string {
  if (typeof msg !== 'string') return 'Bir hata oluştu.';
  return msg
    .replace(/([a-zA-Z]:\\[^:\s]+|\/[a-zA-Z0-9_\-./]+)/g, '[yol]')
    .replace(/(steamLoginSecure%7C%7C|sessionid=)[a-zA-Z0-9_%]+/gi, '[gizli-veri]')
    .slice(0, 300);
}

const ALLOWED_SETTING_KEYS = new Set([
  'language',
  'theme',
  'darkMode',
  'defaultFarmingMode',
  'idleStrategy',
  'autoStartWithWindows',
  'minimizeToTray',
  'autoPauseWhenGameRuns',
  'filterVacGames',
  'personaState',
  'pollIntervalMultiMinutes',
  'pollIntervalSoloMinutes',
  'autoSellCards',
  'autoSellUnderCut',
  'autoLootToMaster',
  'masterAccountId',
  'blacklistAppIds',
  'currencyCode',
  'currencySymbol',
  'multiInstanceFarming',
]);

function isAuthorizedSender(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return event.senderFrame === mainWindow.webContents.mainFrame;
}

function setupIPCHandlers(): void {
  // Window Controls
  ipcMain.on('window:minimize', (event) => {
    if (isAuthorizedSender(event)) mainWindow?.minimize();
  });
  ipcMain.on('window:maximize', (event) => {
    if (!isAuthorizedSender(event)) return;
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', (event) => {
    if (isAuthorizedSender(event)) mainWindow?.close();
  });

  // Accounts
  ipcMain.handle('accounts:get', (event) => {
    if (!isAuthorizedSender(event)) return [];
    return db.getAccounts();
  });
  ipcMain.handle('accounts:startQR', async () => {
    return engine.steamClient.startQRLogin();
  });
  ipcMain.handle('accounts:loginCredentials', async () => {
    return {
      success: false,
      error: 'Parola ile doğrudan giriş güvenlik sebebiyle devre dışıdır. Lütfen QR Kod veya Çerez ile giriş yapın.',
      errorEn: 'Direct password login is disabled for security. Please use QR Code or Cookie login.',
    };
  });
  ipcMain.handle('accounts:loginCookie', async (_, payload) => {
    try {
      if (!payload || typeof payload !== 'object') {
        return { success: false, error: 'Geçersiz veri gönderildi.', errorEn: 'Invalid payload provided.' };
      }
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : '';
      const steamLoginSecure = typeof payload.steamLoginSecure === 'string' ? payload.steamLoginSecure.trim() : '';
      const accountName = typeof payload.accountName === 'string' ? payload.accountName.slice(0, 64).trim() : '';

      if (!sessionId || !steamLoginSecure) {
        return {
          success: false,
          error: 'Session ID ve steamLoginSecure alanları gereklidir.',
          errorEn: 'Session ID and steamLoginSecure are required.',
        };
      }

      const validation = await engine.steamClient.validateAndLogOnWithCookies(sessionId, steamLoginSecure);
      if (!validation.success) {
        return { success: false, error: validation.error, errorEn: validation.errorEn };
      }

      const accId = validation.steamID!;
      const finalAccountName = validation.accountName || accountName || `Steam (${accId.slice(-4)})`;
      const finalAvatar = validation.avatarUrl || '';

      db.saveAccount({
        id: accId,
        accountName: finalAccountName,
        avatarUrl: finalAvatar,
        loginType: 'cookie',
        mode: 'local_client',
        rawToken: `${sessionId.trim()}|${steamLoginSecure.trim()}`,
        isActive: true,
      });

      const isEn = db.getSettings().language === 'en';
      engine.log(
        'success',
        isEn
          ? `🎉 [${finalAccountName}] connected with verified Steam cookies!`
          : `🎉 [${finalAccountName}] hesabı Steam çerezleri başarıyla doğrulanarak bağlandı!`
      );
      mainWindow?.webContents.send('accounts:updated', db.getAccounts());
      return { success: true };
    } catch (e: any) {
      const sanitized = sanitizeErrorMessage(e?.message);
      return {
        success: false,
        error: sanitized || 'Çerez doğrulama sırasında bir hata oluştu.',
        errorEn: sanitized || 'An error occurred during cookie verification.',
      };
    }
  });
  ipcMain.handle('accounts:remove', (event, accountId) => {
    if (!isAuthorizedSender(event)) return false;
    if (typeof accountId === 'string' && accountId.length > 0 && accountId.length < 64) {
      engine.stopFarming(accountId);
      db.deleteAccount(accountId);
      return true;
    }
    return false;
  });
  ipcMain.handle('accounts:setMaster', (event, accountId) => {
    if (!isAuthorizedSender(event)) return false;
    if (typeof accountId === 'string' && accountId.length > 0 && accountId.length < 64) {
      db.setMasterAccount(accountId);
      return true;
    }
    return false;
  });
  ipcMain.handle('accounts:setActive', (event, accountId) => {
    if (!isAuthorizedSender(event)) return false;
    if (typeof accountId === 'string' && accountId.length > 0 && accountId.length < 64) {
      db.setActiveAccount(accountId);
      const accounts = db.getAccounts();
      const targetAcc = accounts.find((a) => a.id === accountId);
      if (targetAcc) {
        // Sadece cookie hesabı standalone olamaz (CM token'ı yoktur)
        let correctedMode = targetAcc.mode || 'standalone';
        if (targetAcc.loginType === 'cookie' && targetAcc.mode !== 'local_client') {
          correctedMode = 'local_client';
          db.saveAccount({ id: targetAcc.id, mode: 'local_client' });
        }

        // Sync defaultFarmingMode setting so settings always match the active account
        db.updateSettings({ defaultFarmingMode: correctedMode });
        engine.setActiveAccountId(accountId);
      }
      mainWindow?.webContents.send('accounts:updated', db.getAccounts());
      return true;
    }
    return false;
  });
  ipcMain.handle('accounts:setMode', (_, payload) => {
    if (!payload || typeof payload !== 'object') return false;
    const { accountId, mode } = payload;
    if (typeof accountId !== 'string' || (mode !== 'standalone' && mode !== 'local_client')) {
      return false;
    }
    const accounts = db.getAccounts();
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return false;

    // Sadece cookie hesabı standalone olamaz (CM token'ı bulunmaz)
    if (acc.loginType === 'cookie' && mode === 'standalone') {
      console.warn(`[setMode] Cookie hesabı '${acc.accountName}' standalone moda geçirilmeye çalışıldı — reddedildi.`);
      return false;
    }

    // QR ve Credentials hesapları hem standalone hem local_client modunda özgürce çalışabilir
    db.saveAccount({ id: accountId, mode });

    // Aktif hesap ise varsayılan kart düşürme modu ayarını da senkronize et
    const currentActiveId = engine.getActiveAccountId();
    if (acc.isActive || currentActiveId === accountId) {
      db.updateSettings({ defaultFarmingMode: mode });
      if (mode === 'local_client' && engine.steamClient.getIsCmConnected()) {
        engine.steamClient.disconnect();
      }
    }

    mainWindow?.webContents.send('accounts:updated', db.getAccounts());
    return true;
  });

  // Farming Engine
  ipcMain.handle('farming:start', (event, accountId) => {
    if (!isAuthorizedSender(event)) return false;
    const validId = typeof accountId === 'string' && accountId.length > 0 && accountId.length < 64 ? accountId : undefined;
    return engine.startFarming(validId);
  });
  ipcMain.handle('farming:stop', (event, accountId) => {
    if (!isAuthorizedSender(event)) return false;
    const validId = typeof accountId === 'string' && accountId.length > 0 && accountId.length < 64 ? accountId : undefined;
    return engine.stopFarming(validId);
  });
  ipcMain.handle('farming:startAccount', (event, accountId) => {
    if (!isAuthorizedSender(event)) return false;
    if (typeof accountId !== 'string' || !accountId) return false;
    return engine.startFarming(accountId);
  });
  ipcMain.handle('farming:stopAccount', (event, accountId) => {
    if (!isAuthorizedSender(event)) return false;
    if (typeof accountId !== 'string' || !accountId) return false;
    return engine.stopFarming(accountId);
  });
  ipcMain.handle('farming:pause', (event) => {
    if (!isAuthorizedSender(event)) return false;
    return engine.pause('user');
  });
  ipcMain.handle('farming:resume', (event) => {
    if (!isAuthorizedSender(event)) return false;
    return engine.resume();
  });
  ipcMain.handle('farming:getStatus', (event) => {
    if (!isAuthorizedSender(event)) return engine.getStatus();
    return engine.getStatus();
  });
  ipcMain.handle('farming:forceCheck', (event) => {
    if (!isAuthorizedSender(event)) return;
    return engine.refreshAndEvaluateQueue();
  });

  // Games & Queue
  ipcMain.handle('queue:get', (event, accountId) => {
    if (!isAuthorizedSender(event)) return [];
    const validId = typeof accountId === 'string' && accountId.length > 0 && accountId.length < 64 ? accountId : undefined;
    return db.getQueue(validId);
  });
  ipcMain.handle('queue:updateOrder', (event, order) => {
    if (!isAuthorizedSender(event)) return false;
    if (!Array.isArray(order)) return false;
    const sanitizedOrder = order
      .map((item) => Number(item))
      .filter((appId) => Number.isInteger(appId) && appId > 0);
    db.updateQueueOrder(sanitizedOrder);
    return true;
  });
  ipcMain.handle('queue:startNow', (event, appId) => {
    if (!isAuthorizedSender(event)) return false;
    const numAppId = Number(appId);
    if (!Number.isInteger(numAppId) || numAppId <= 0) return false;
    return engine.startFarmingGameNow(numAppId);
  });
  ipcMain.handle('queue:remove', (event, appId) => {
    if (!isAuthorizedSender(event)) return false;
    const numAppId = Number(appId);
    if (!Number.isInteger(numAppId) || numAppId <= 0) return false;
    db.removeGameFromQueue(numAppId);
    return true;
  });
  ipcMain.handle('queue:toggleHide', async (event, payload) => {
    if (!isAuthorizedSender(event)) return false;
    if (!payload || typeof payload !== 'object') return false;
    const numAppId = Number(payload.appId);
    if (!Number.isInteger(numAppId) || numAppId <= 0) return false;
    const isHidden = Boolean(payload.isHidden);
    db.toggleGameBlacklist(numAppId, isHidden);
    if (engine.getStatus().isFarming) {
      await engine.refreshAndEvaluateQueue();
      engine.broadcastStatus();
    }
    return true;
  });
  ipcMain.handle('queue:toggleHideAll', async (event, payload: { accountId?: string; isHidden: boolean }) => {
    if (!isAuthorizedSender(event)) return false;
    const targetAccountId = (payload && typeof payload.accountId === 'string' && payload.accountId.length < 64)
      ? payload.accountId
      : engine.getActiveAccountId() || (db.getAccounts().find((a) => a.isActive)?.id) || '';
    const isHidden = Boolean(payload?.isHidden);
    db.toggleAllGamesBlacklist(targetAccountId, isHidden);
    if (engine.getStatus().isFarming) {
      await engine.refreshAndEvaluateQueue();
      engine.broadcastStatus();
    }
    const updatedQueue = db.getQueue(targetAccountId);
    engine.emit('queueUpdated', updatedQueue);
    return true;
  });
  ipcMain.handle('queue:refreshBadges', async (event, accountId) => {
    if (!isAuthorizedSender(event)) return [];
    try {
      const accounts = db.getAccounts();
      const activeAccount = accountId
        ? accounts.find((a) => a.id === accountId)
        : accounts.find((a) => a.isActive) || accounts[0];
      const targetId = accountId || activeAccount?.id;

      const isEn = db.getSettings().language === 'en';

      if (!targetId) {
        engine.log(
          'error',
          isEn
            ? 'Badge scan failed: No registered active Steam account selected.'
            : 'Rozet tarama başarısız: Kayıtlı aktif bir Steam hesabı seçilmedi.'
        );
        return [];
      }

      const rawToken = db.getAccountToken(targetId);
      engine.log(
        'info',
        isEn
          ? 'Scanning Steam badges and card-eligible games...'
          : 'Steam rozetleri ve kart hakkı olan oyunlar taranıyor...'
      );

      if (rawToken) {
        if (activeAccount?.mode === 'standalone') {
          await engine.steamClient.ensureCommunitySession(targetId, rawToken);
        } else if (activeAccount?.mode === 'local_client' && rawToken.includes('|')) {
          const [sessionId, steamLoginSecure] = rawToken.split('|');
          engine.steamClient.logOnWithCookies(sessionId, steamLoginSecure);
        }
      }

      const badges = await engine.fetchAndSaveBadges(targetId, rawToken || undefined);

      if (badges.length > 0) {
        engine.log(
          'success',
          isEn
            ? `Badge scan complete: ${badges.length} games with card drops queued.`
            : `Rozet taraması tamamlandı: ${badges.length} adet kart hakkı olan oyun kuyruğa eklendi.`
        );
      } else {
        engine.log(
          'warning',
          isEn
            ? 'No card-eligible games found in your library, or all cards dropped.'
            : 'Kütüphanenizde kart hakkı olan oyun bulunamadı veya tüm kartlar düşürülmüş.'
        );
      }

      return db.getQueue(targetId);
    } catch (err: any) {
      const isEn = db.getSettings().language === 'en';
      engine.log(
        'error',
        isEn
          ? `Badge scan error: ${err?.message || err}`
          : `Rozet tarama hatası: ${err?.message || err}`
      );
      return db.getQueue(accountId);
    }
  });

  // Market & Loot
  ipcMain.handle('market:getDrops', (event) => {
    if (!isAuthorizedSender(event)) return [];
    return db.getCardDrops();
  });
  ipcMain.handle('market:syncInventory', async (event, accountId) => {
    if (!isAuthorizedSender(event)) {
      return { success: false, count: 0, message: 'Unauthorized' };
    }
    const targetAccountId = accountId || engine.getActiveAccountId() || (db.getAccounts().find((a) => a.isActive)?.id) || '';
    const isEn = db.getSettings().language === 'en';

    if (!targetAccountId) {
      return {
        success: false,
        count: 0,
        message: isEn ? 'No active Steam account found.' : 'Aktif Steam hesabı bulunamadı.',
      };
    }

    try {
      const rawToken = db.getAccountToken(targetAccountId);
      const inventoryCards = await engine.steamClient.fetchCardInventory(targetAccountId, rawToken || undefined, true);

      db.cleanNonCardDrops(targetAccountId);
      db.deduplicateCardDrops();

      if (inventoryCards.length === 0) {
        db.repairGenericCardDrops();
        return {
          success: true,
          count: 0,
          message: isEn
            ? 'Inventory checked. (Private profile or no trading cards found in inventory)'
            : 'Envanter kontrol edildi. (Gizli profil veya envanterde koleksiyon kartı bulunamadı)',
        };
      }

      let addedCount = 0;
      let updatedCount = 0;
      let linkedCount = 0;
      const existingDrops = db.getCardDrops();
      const existingAssetMap = new Map<string, typeof existingDrops[0]>();

      for (const d of existingDrops) {
        if (d.accountId === targetAccountId && d.assetId) {
          existingAssetMap.set(d.assetId, d);
        }
      }

      // Daha önce eklenmiş fakat assetId'si boş olan veya generic fallback ismi taşıyan kayıtları bul
      const unlinkedDrops = existingDrops.filter(
        (d) =>
          d.accountId === targetAccountId &&
          (!d.assetId || (d.cardName && d.cardName.includes('Koleksiyon Kartı') && d.cardName.startsWith(d.gameTitle)))
      );

      for (const card of inventoryCards) {
        if (!card.assetId) continue;

        // 1. Durum: Zaten bu assetId ile kayıtlıysa, adını ve resmini envanterdeki yüksek kaliteli gerçek veriyle güncelle
        if (existingAssetMap.has(card.assetId)) {
          const existing = existingAssetMap.get(card.assetId)!;
          const isGenericName =
            !existing.cardName ||
            (existing.cardName.includes('Koleksiyon Kartı') && existing.cardName.startsWith(existing.gameTitle));
          const hasBetterImage = card.cardImage && card.cardImage !== existing.cardImage;

          if (isGenericName || hasBetterImage || existing.cardName !== card.cardName) {
            db.updateCardDropAssetId(existing.id, card.assetId, card.cardName, card.cardImage, card.marketHashName);
            updatedCount++;
          }
          continue;
        }

        // 2. Durum: Henüz assetId atanmamış veya generic fallback kaydı var mı? (aynı oyun)
        const unlinkedIndex = unlinkedDrops.findIndex((u) => u.appId === card.appId);

        if (unlinkedIndex !== -1) {
          const targetDrop = unlinkedDrops[unlinkedIndex];
          db.updateCardDropAssetId(targetDrop.id, card.assetId, card.cardName, card.cardImage, card.marketHashName);
          unlinkedDrops.splice(unlinkedIndex, 1);
          existingAssetMap.set(card.assetId, targetDrop);
          linkedCount++;
          continue;
        }

        // 3. Durum: Yeni kart kaydı oluştur
        db.recordCardDrop({
          accountId: targetAccountId,
          appId: card.appId,
          gameTitle: card.gameTitle,
          cardName: card.cardName,
          marketHashName: card.marketHashName,
          cardImage: card.cardImage,
          assetId: card.assetId,
          isSold: false,
          soldPrice: null,
          isLooted: false,
        });
        existingAssetMap.set(card.assetId, {} as any);
        addedCount++;
      }

      engine.broadcastStatus();
      const detailsArr: string[] = [];
      if (addedCount > 0) detailsArr.push(isEn ? `${addedCount} new added` : `${addedCount} yeni eklendi`);
      if (linkedCount > 0) detailsArr.push(isEn ? `${linkedCount} matched existing` : `${linkedCount} mevcut kart eşleştirildi`);
      if (updatedCount > 0) detailsArr.push(isEn ? `${updatedCount} updated` : `${updatedCount} kart bilgisi güncellendi`);
      const details = detailsArr.length > 0 ? ` (${detailsArr.join(', ')})` : '';

      return {
        success: true,
        count: inventoryCards.length,
        message: isEn
          ? `Scanned ${inventoryCards.length} cards from inventory successfully${details}.`
          : `Envanterden ${inventoryCards.length} kart başarıyla tarandı${details}.`,
      };
    } catch (err: any) {
      if (err?.isPrivate || err?.message === 'PROFILE_PRIVATE' || err?.message?.toLowerCase()?.includes('private')) {
        return {
          success: false,
          isPrivate: true,
          count: 0,
          message: isEn
            ? '🔒 Steam Profile or Inventory is set to Private! To display cards, set Inventory to "Public" in Steam Privacy Settings or refresh your session cookies.'
            : '🔒 Steam Profil veya Envanteriniz Gizli (Private) olarak ayarlanmış! Kartların görüntülenebilmesi için Steam Profilinizden Gizlilik Ayarları > Envanter seçeneğini "Herkese Açık" (Public) yapın veya oturum çerezlerinizi yenileyin.',
        };
      }
      return {
        success: false,
        count: 0,
        message: isEn
          ? `Inventory scan error: ${sanitizeErrorMessage(err?.message || err)}`
          : `Envanter taranırken hata: ${sanitizeErrorMessage(err?.message || err)}`,
      };
    }
  });

  ipcMain.handle('market:clearHistory', async (event, accountId) => {
    if (!isAuthorizedSender(event)) return false;
    const validId = typeof accountId === 'string' && accountId.length > 0 && accountId.length < 64 ? accountId : undefined;
    db.clearCardDrops(validId);
    engine.broadcastStatus();
    return true;
  });

  ipcMain.handle('market:deduplicateDrops', async (event) => {
    if (!isAuthorizedSender(event)) return { success: false, removed: 0 };
    const removed = db.deduplicateCardDrops();
    engine.broadcastStatus();
    return { success: true, removed };
  });
  ipcMain.handle('market:executeLoot', async (event, payload) => {
    const isEn = db.getSettings().language === 'en';
    if (!isAuthorizedSender(event)) {
      return { success: false, message: isEn ? 'Unauthorized sender.' : 'Yetkisiz istek.' };
    }
    if (!payload || typeof payload !== 'object') {
      return { success: false, message: isEn ? 'Invalid parameters.' : 'Geçersiz parametre.' };
    }
    const fromAccountId = typeof payload.fromAccountId === 'string' ? payload.fromAccountId : '';
    const toAccountId = typeof payload.toAccountId === 'string' ? payload.toAccountId : '';
    if (!fromAccountId || !toAccountId) {
      return {
        success: false,
        message: isEn ? 'Missing sender or receiver account ID.' : 'Gönderen veya alan hesap kimliği eksik.',
      };
    }
    const result = await LootService.transferCardsToMaster(
      engine.steamClient.community,
      toAccountId,
      !isEn,
      (msg) => {
        db.addLog({ level: 'info', message: msg, accountId: fromAccountId });
      }
    );
    return result;
  });
  ipcMain.handle('market:sellCard', async (event, payload) => {
    const settings = db.getSettings();
    const isEn = settings.language === 'en';
    const currencySymbol = settings.currencySymbol || '$';

    if (!isAuthorizedSender(event)) {
      return { success: false, message: isEn ? 'Unauthorized sender.' : 'Yetkisiz istek.' };
    }
    if (!payload || typeof payload !== 'object') return { success: false, message: isEn ? 'Invalid parameter.' : 'Geçersiz parametre.' };
    const numDropId = Number(payload.cardDropId);
    if (!Number.isInteger(numDropId) || numDropId <= 0) {
      return { success: false, message: isEn ? 'Invalid Card ID.' : 'Kart ID geçersiz.' };
    }
    const drops = db.getCardDrops();
    const target = drops.find((d) => d.id === numDropId);
    if (!target) return { success: false, message: isEn ? 'Card not found.' : 'Kart bulunamadı.' };

    const customPrice = Number(payload.customPrice);
    const parsedPrice = typeof customPrice === 'number' && !isNaN(customPrice) && customPrice > 0 && customPrice <= 100000
      ? customPrice
      : 0.05;

    db.markCardSold(numDropId, parsedPrice);
    db.addLog({
      level: 'info',
      message: isEn
        ? `"${target.cardName}" listed for sale at ${currencySymbol}${parsedPrice}.`
        : `"${target.cardName}" kartı ${currencySymbol}${parsedPrice} üzerinden listelendi.`,
      accountId: target.accountId,
    });
    return {
      success: true,
      message: isEn ? 'Card listed for sale successfully.' : 'Kart satışa koyuldu.',
    };
  });

  ipcMain.handle('market:getProfitableGames', async (event, payload) => {
    if (!isAuthorizedSender(event)) return [];
    try {
      const activeAccountId = engine.getActiveAccountId() || (db.getAccounts().find((a) => a.isActive)?.id);
      const queue = activeAccountId ? db.getQueue(activeAccountId) : [];
      const ownedAppIds = new Set<number>(queue.map((g) => g.appId));

      const settings = db.getSettings();
      let numMaxPrice = 5.0;
      let forceRefresh = false;

      if (typeof payload === 'number') {
        numMaxPrice = payload > 0 ? payload : 5.0;
      } else if (payload && typeof payload === 'object') {
        numMaxPrice = typeof payload.maxPrice === 'number' && payload.maxPrice > 0 ? payload.maxPrice : 5.0;
        forceRefresh = Boolean(payload.forceRefresh);
      }

      return await ProfitService.getProfitableGames(
        ownedAppIds,
        settings.currencySymbol || '$',
        numMaxPrice,
        forceRefresh
      );
    } catch (err) {
      console.warn('[IPC] market:getProfitableGames error:', err);
      return [];
    }
  });

  ipcMain.handle('settings:get', (event) => {
    if (!isAuthorizedSender(event)) return db.getSettings();
    return db.getSettings();
  });
  ipcMain.handle('settings:update', async (event, newSettings) => {
    if (!isAuthorizedSender(event) || !newSettings || typeof newSettings !== 'object') {
      return db.getSettings();
    }
    const sanitizedSettings: Record<string, any> = {};
    for (const [key, value] of Object.entries(newSettings)) {
      if (ALLOWED_SETTING_KEYS.has(key) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
        sanitizedSettings[key] = value;
      }
    }
    const updated = db.updateSettings(sanitizedSettings);
    if (sanitizedSettings.defaultFarmingMode) {
      const currentActiveId = engine.getActiveAccountId();
      const accounts = db.getAccounts();
      const activeAcc = accounts.find((a) => a.id === currentActiveId) || accounts.find((a) => a.isActive) || accounts[0];
      if (activeAcc && !(activeAcc.loginType === 'cookie' && sanitizedSettings.defaultFarmingMode === 'standalone')) {
        db.saveAccount({ id: activeAcc.id, mode: sanitizedSettings.defaultFarmingMode });
        if (sanitizedSettings.defaultFarmingMode === 'local_client' && engine.steamClient.getIsCmConnected()) {
          engine.steamClient.disconnect();
        }
        mainWindow?.webContents.send('accounts:updated', db.getAccounts());
      }
    }
    const currentLang = newSettings.language || db.getSettings().language || 'tr';
    const isEn = currentLang === 'en';

    if (newSettings.personaState) {
      engine.steamClient.setPersonaState(newSettings.personaState);
      const stateLabels: Record<string, string> = isEn
        ? {
          online: 'Online',
          silent_online: 'Silent Online',
          invisible: 'Invisible',
          offline: 'Offline',
        }
        : {
          online: 'Çevrimiçi (Online)',
          silent_online: 'Gizli Çevrimiçi (Silent Online)',
          invisible: 'Görünmez (Invisible)',
          offline: 'Çevrimdışı (Offline)',
        };

      engine.log(
        'info',
        isEn
          ? `Steam status preference updated to "${stateLabels[newSettings.personaState] || newSettings.personaState}".`
          : `Steam durum tercihi "${stateLabels[newSettings.personaState] || newSettings.personaState}" olarak güncellendi.`
      );

      // Verify active account connection mode
      const accounts = db.getAccounts();
      const currentActiveId = engine.getActiveAccountId();
      const activeAcc = accounts.find((a) => a.id === currentActiveId) || accounts.find((a) => a.isActive) || accounts[0];
      if (activeAcc) {
        if (activeAcc.mode === 'standalone') {
          if (!engine.steamClient.getIsCmConnected()) {
            await engine.ensureConnectedToSteam();
          }
        } else if (activeAcc.mode === 'local_client') {
          engine.log(
            'warning',
            isEn
              ? 'Notice: Accounts in Cookie (Local Client) mode cannot connect directly to Steam Friends servers. To appear "Online" or "In-Game" in your friends list, please connect the account via QR Code (Standalone).'
              : 'Bilgi: Çerez (Cookie/Local Client) modundaki hesaplar doğrudan Steam Arkadaşlar sunucusuna bağlanamaz. Arkadaş listenizde "Çevrimiçi" veya "Oyunda" görünmek için lütfen hesabı QR Kod ile (Standalone) bağlayın.'
          );
        }
      }
    }

    if (newSettings.idleStrategy) {
      const strategyLabels: Record<string, string> = isEn
        ? {
          smart_hybrid: 'Smart Hybrid',
          solo_only: 'Solo Only',
          warmup_only: 'Warm-Up Only',
          simultaneous: 'Simultaneous (32)',
        }
        : {
          smart_hybrid: 'Akıllı Hibrit',
          solo_only: 'Sadece Solo',
          warmup_only: 'Sadece Hızlı Ön Isınma',
          simultaneous: 'Eşzamanlı Çoklu (32)',
        };

      engine.log(
        'info',
        isEn
          ? `Idle strategy changed to "${strategyLabels[newSettings.idleStrategy] || newSettings.idleStrategy}".`
          : `Kart düşürme modu "${strategyLabels[newSettings.idleStrategy] || newSettings.idleStrategy}" olarak değiştirildi.`
      );

      if (engine.isFarmingRunning()) {
        await engine.refreshAndEvaluateQueue();
      }
    }

    return updated;
  });
  ipcMain.handle('logs:get', (event) => {
    if (!isAuthorizedSender(event)) return [];
    return db.getLogs();
  });
  ipcMain.handle('logs:clear', (event) => {
    if (!isAuthorizedSender(event)) return;
    return db.clearLogs();
  });
}
