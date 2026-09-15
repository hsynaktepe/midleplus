export type LoginType = 'qr' | 'credentials' | 'cookie';
export type FarmingMode = 'standalone' | 'local_client';
export type PersonaState = 'invisible' | 'online' | 'offline' | 'silent_online';
export type PauseReason = 'user' | 'in_game' | 'rate_limit_429' | null;

export interface Account {
  id: string; // SteamID64
  accountName: string;
  avatarUrl: string;
  loginType: LoginType;
  isActive: boolean;
  mode: FarmingMode;
  isMaster: boolean;
  personaState: PersonaState;
  status: 'connected' | 'disconnected' | 'logging_in' | 'error';
  errorMessage?: string;
}

export interface GameQueueItem {
  accountId: string;
  appId: number;
  gameTitle: string;
  headerImage: string;
  cardsRemaining: number;
  playtimeMinutes: number;
  isVac: boolean;
  isBlacklisted: boolean;
  sortOrder: number;
  status: 'pending' | 'warming_up' | 'farming' | 'completed';
  estimatedCardPrice?: number;
}

export interface CardDrop {
  id: number;
  accountId: string;
  appId: number;
  gameTitle: string;
  cardName: string;
  marketHashName: string;
  cardImage?: string;
  assetId?: string;
  droppedAt: string;
  isSold: boolean;
  soldPrice: number | null;
  isLooted: boolean;
}

export type IdleStrategy = 'smart_hybrid' | 'solo_only' | 'warmup_only' | 'simultaneous';

export interface FarmingActiveGame {
  appId: number;
  title: string;
  headerImage: string;
  playtimeMinutes: number;
  cardsRemaining: number;
}

export interface FarmingStatus {
  isFarming: boolean;
  isPaused: boolean;
  pauseReason: PauseReason;
  rateLimitCountdownSeconds: number;
  activePhase: 'warmup_32' | 'solo_drop' | 'simultaneous' | 'idle';
  idleStrategy?: IdleStrategy;
  activeGames: FarmingActiveGame[];
  totalCardsRemaining: number;
  totalCardsDroppedSession: number;
  totalCardsDroppedAllTime: number;
  sessionElapsedSeconds: number;
  nextCheckSecondsRemaining: number;
  activeAccountId: string | null;
  multiStatus?: Record<string, FarmingStatus>;
}

export type AppTheme = 'steam' | 'neon' | 'midnight';

export interface AppSettings {
  language: 'tr' | 'en';
  theme: AppTheme;
  darkMode: boolean;
  defaultFarmingMode: FarmingMode;
  idleStrategy: IdleStrategy;
  autoStartWithWindows: boolean;
  minimizeToTray: boolean;
  autoPauseWhenGameRuns: boolean;
  filterVacGames: boolean;
  personaState: PersonaState;
  pollIntervalMultiMinutes: number; // default 15
  pollIntervalSoloMinutes: number; // default 5
  autoSellCards: boolean;
  autoSellUnderCut: number; // e.g. 0.01
  autoLootToMaster: boolean;
  masterAccountId: string | null;
  blacklistAppIds: number[];
  currencyCode?: number;
  currencySymbol?: string;
  multiInstanceFarming?: boolean;
}

export interface QRAuthSession {
  challengeUrl: string;
  qrCodeDataUrl: string;
  isWaiting: boolean;
}

export interface AppLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'warning' | 'success' | 'error';
  message: string;
  accountId?: string;
  appId?: number;
}

export type SteamAlertType = 'error' | 'warn' | 'info';

export interface SteamAlert {
  id: string;
  type: SteamAlertType;
  titleKey: string;   // i18n key
  messageKey: string; // i18n key
  rawMessage?: string; // orijinal teknik hata (detay göstermek için)
  timestamp: string;
}

export interface ProfitableGameItem {
  appId: number;
  gameTitle: string;
  headerImage: string;
  gamePrice: number;
  totalCards: number;
  cardsDropCount: number;
  avgCardPrice: number;
  totalCardsValue: number;
  netRevenue: number;
  netProfit: number;
  profitPercent: number;
  discountPercent?: number;
  originalPrice?: number;
  isOwned?: boolean;
  storeUrl: string;
}

// Window API Exposed to Renderer via Preload
export interface ElectronAPI {
  // Accounts
  getAccounts: () => Promise<Account[]>;
  startQRAuth: () => Promise<QRAuthSession>;
  checkQRAuthStatus: () => Promise<{ success: boolean; account?: Account; error?: string }>;
  loginWithCredentials: (username: string, password: string, twoFactorCode?: string) => Promise<{ success: boolean; account?: Account; needs2FA?: boolean; error?: string }>;
  loginWithCookie: (sessionId: string, steamLoginSecure: string, accountName?: string) => Promise<{ success: boolean; account?: Account; error?: string; errorEn?: string }>;
  removeAccount: (accountId: string) => Promise<boolean>;
  setMasterAccount: (accountId: string) => Promise<boolean>;
  setActiveAccount: (accountId: string) => Promise<boolean>;
  setAccountMode: (accountId: string, mode: FarmingMode) => Promise<boolean>;
  
  // Farming Engine
  startFarming: (accountId?: string) => Promise<boolean>;
  stopFarming: (accountId?: string) => Promise<boolean>;
  startFarmingAccount?: (accountId: string) => Promise<boolean>;
  stopFarmingAccount?: (accountId: string) => Promise<boolean>;
  pauseFarming: () => Promise<boolean>;
  resumeFarming: () => Promise<boolean>;
  getFarmingStatus: () => Promise<FarmingStatus>;
  forceCheckCards: () => Promise<void>;
  
  // Games & Queue
  getQueue: (accountId?: string) => Promise<GameQueueItem[]>;
  updateQueueOrder: (appIdsInOrder: number[]) => Promise<boolean>;
  startFarmingGameNow: (appId: number) => Promise<boolean>;
  removeGameFromQueue: (appId: number) => Promise<boolean>;
  toggleHideGame: (appId: number, isHidden: boolean) => Promise<boolean>;
  toggleHideAllGames: (accountId: string | undefined, isHidden: boolean) => Promise<boolean>;
  refreshBadges: (accountId?: string) => Promise<GameQueueItem[]>;
  
  // Market & Loot
  getCardDrops: () => Promise<CardDrop[]>;
  syncInventoryCards: (accountId?: string) => Promise<{ success: boolean; count: number; message: string; isPrivate?: boolean }>;
  clearCardDrops: (accountId?: string) => Promise<boolean>;
  deduplicateCardDrops: () => Promise<{ success: boolean; removed: number }>;
  executeManualLoot: (fromAccountId: string, toAccountId: string) => Promise<{ success: boolean; transferredCount: number; message: string }>;
  sellCardNow: (cardDropId: number, customPrice?: number) => Promise<{ success: boolean; listingId?: string; message: string }>;
  getProfitableGames: (maxPrice?: number | { maxPrice?: number; forceRefresh?: boolean }, forceRefresh?: boolean) => Promise<ProfitableGameItem[]>;
  
  // Settings & Logs
  getSettings: () => Promise<AppSettings>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  getLogs: () => Promise<AppLog[]>;
  clearLogs: () => Promise<void>;
  
  // Window Controls
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  
  // Subscriptions
  onFarmingStatusChanged: (callback: (status: FarmingStatus) => void) => () => void;
  onCardDropped: (callback: (drop: CardDrop) => void) => () => void;
  onLogAdded: (callback: (log: AppLog) => void) => () => void;
  onAccountsUpdated?: (callback: (accounts: Account[]) => void) => () => void;
  onQueueUpdated?: (callback: (queue: GameQueueItem[]) => void) => () => void;
  onSteamAlert?: (callback: (alert: SteamAlert) => void) => () => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
