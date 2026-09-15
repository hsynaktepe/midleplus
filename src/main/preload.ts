import { contextBridge, ipcRenderer } from 'electron';
import { ElectronAPI, FarmingMode } from '../shared/types';

const api: ElectronAPI = {
  // Accounts
  getAccounts: () => ipcRenderer.invoke('accounts:get'),
  startQRAuth: () => ipcRenderer.invoke('accounts:startQR'),
  checkQRAuthStatus: () => ipcRenderer.invoke('accounts:checkQRStatus'),
  loginWithCredentials: (u, p, c) => ipcRenderer.invoke('accounts:loginCredentials', { username: u, password: p, twoFactorCode: c }),
  loginWithCookie: (s, l, n) => ipcRenderer.invoke('accounts:loginCookie', { sessionId: s, steamLoginSecure: l, accountName: n }),
  removeAccount: (id) => ipcRenderer.invoke('accounts:remove', id),
  setMasterAccount: (id) => ipcRenderer.invoke('accounts:setMaster', id),
  setActiveAccount: (id) => ipcRenderer.invoke('accounts:setActive', id),
  setAccountMode: (id, mode: FarmingMode) => ipcRenderer.invoke('accounts:setMode', { accountId: id, mode }),

  // Farming Engine
  startFarming: (id) => ipcRenderer.invoke('farming:start', id),
  stopFarming: (id) => ipcRenderer.invoke('farming:stop', id),
  startFarmingAccount: (id) => ipcRenderer.invoke('farming:startAccount', id),
  stopFarmingAccount: (id) => ipcRenderer.invoke('farming:stopAccount', id),
  pauseFarming: () => ipcRenderer.invoke('farming:pause'),
  resumeFarming: () => ipcRenderer.invoke('farming:resume'),
  getFarmingStatus: () => ipcRenderer.invoke('farming:getStatus'),
  forceCheckCards: () => ipcRenderer.invoke('farming:forceCheck'),

  // Games & Queue
  getQueue: (id) => ipcRenderer.invoke('queue:get', id),
  updateQueueOrder: (order) => ipcRenderer.invoke('queue:updateOrder', order),
  startFarmingGameNow: (appId) => ipcRenderer.invoke('queue:startNow', appId),
  removeGameFromQueue: (appId) => ipcRenderer.invoke('queue:remove', appId),
  toggleHideGame: (appId, isHidden) => ipcRenderer.invoke('queue:toggleHide', { appId, isHidden }),
  toggleHideAllGames: (accountId, isHidden) => ipcRenderer.invoke('queue:toggleHideAll', { accountId, isHidden }),
  refreshBadges: (id) => ipcRenderer.invoke('queue:refreshBadges', id),

  // Market & Loot
  getCardDrops: () => ipcRenderer.invoke('market:getDrops'),
  syncInventoryCards: (accountId) => ipcRenderer.invoke('market:syncInventory', accountId),
  clearCardDrops: (accountId) => ipcRenderer.invoke('market:clearHistory', accountId),
  deduplicateCardDrops: () => ipcRenderer.invoke('market:deduplicateDrops'),
  executeManualLoot: (fromId, toId) => ipcRenderer.invoke('market:executeLoot', { fromAccountId: fromId, toAccountId: toId }),
  sellCardNow: (dropId, price) => ipcRenderer.invoke('market:sellCard', { cardDropId: dropId, customPrice: price }),
  getProfitableGames: (maxPrice, forceRefresh) =>
    ipcRenderer.invoke('market:getProfitableGames', typeof maxPrice === 'object' ? maxPrice : { maxPrice, forceRefresh }),

  // Settings & Logs
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (s) => ipcRenderer.invoke('settings:update', s),
  getLogs: () => ipcRenderer.invoke('logs:get'),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),

  // Window Controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // Subscriptions
  onFarmingStatusChanged: (callback) => {
    const handler = (_: any, status: any) => callback(status);
    ipcRenderer.on('farming:statusChanged', handler);
    return () => ipcRenderer.removeListener('farming:statusChanged', handler);
  },
  onCardDropped: (callback) => {
    const handler = (_: any, drop: any) => callback(drop);
    ipcRenderer.on('farming:cardDropped', handler);
    return () => ipcRenderer.removeListener('farming:cardDropped', handler);
  },
  onLogAdded: (callback) => {
    const handler = (_: any, log: any) => callback(log);
    ipcRenderer.on('logs:added', handler);
    return () => ipcRenderer.removeListener('logs:added', handler);
  },
  onAccountsUpdated: (callback) => {
    const handler = (_: any, accounts: any) => callback(accounts);
    ipcRenderer.on('accounts:updated', handler);
    return () => ipcRenderer.removeListener('accounts:updated', handler);
  },
  onQueueUpdated: (callback) => {
    const handler = (_: any, queue: any) => callback(queue);
    ipcRenderer.on('queue:updated', handler);
    return () => ipcRenderer.removeListener('queue:updated', handler);
  },
  onSteamAlert: (callback) => {
    const handler = (_: any, alert: any) => callback(alert);
    ipcRenderer.on('steam:alert', handler);
    return () => ipcRenderer.removeListener('steam:alert', handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
