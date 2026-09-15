import EventEmitter from 'events';
import { DatabaseService } from './database';
import { SteamClientWrapper, cleanCardName } from './steamClient';
import { LocalClientWatcher } from './localClientWatcher';
import { ProtectionService } from './protectionService';
import { AdaptivePoller } from './adaptivePoller';
import { MarketService } from './marketService';
import { LootService } from './lootService';
import { FarmingStatus, GameQueueItem, PauseReason, CardDrop, AppSettings, AppLog, Account } from '../../shared/types';

export interface AccountSessionState {
  accountId: string;
  accountName: string;
  steamClient: SteamClientWrapper;
  poller: AdaptivePoller;
  isFarming: boolean;
  isPaused: boolean;
  pauseReason: PauseReason;
  currentPhase: 'warmup_32' | 'solo_drop' | 'simultaneous' | 'idle';
  sessionElapsedSeconds: number;
  totalCardsDroppedSession: number;
  sessionTimer: NodeJS.Timeout | null;
  currentActiveGamesList: GameQueueItem[];
  initialInventoryAssetIds: Set<string>;
  sessionDroppedAssetIds: Set<string>;
}

export class FarmingEngine extends EventEmitter {
  private db: DatabaseService;
  public localWatcher: LocalClientWatcher;
  public protectionService: ProtectionService;

  // Multi-session map: accountId -> AccountSessionState
  private sessions = new Map<string, AccountSessionState>();
  public activeAccountId: string | null = null;

  // Fallback default instances for backwards-compatible direct access
  private defaultSteamClient: SteamClientWrapper;
  private defaultPoller: AdaptivePoller;

  constructor(db: DatabaseService) {
    super();
    this.db = db;
    const initialSettings = this.db.getSettings();
    this.defaultSteamClient = new SteamClientWrapper(initialSettings?.personaState || 'invisible');
    this.defaultPoller = new AdaptivePoller();
    this.localWatcher = new LocalClientWatcher();
    this.protectionService = new ProtectionService();

    this.setupGlobalListeners();
  }

  // Backwards-compatible getters for direct steamClient / poller references
  public get steamClient(): SteamClientWrapper {
    if (this.activeAccountId && this.sessions.has(this.activeAccountId)) {
      return this.sessions.get(this.activeAccountId)!.steamClient;
    }
    return this.defaultSteamClient;
  }

  public get poller(): AdaptivePoller {
    if (this.activeAccountId && this.sessions.has(this.activeAccountId)) {
      return this.sessions.get(this.activeAccountId)!.poller;
    }
    return this.defaultPoller;
  }

  public log(level: 'info' | 'warn' | 'warning' | 'error' | 'success', message: string, appId?: number, accountId?: string): AppLog {
    const fullLog = this.db.addLog({
      level,
      message,
      accountId: accountId || this.activeAccountId || undefined,
      appId,
    });
    this.emit('logAdded', fullLog);
    return fullLog;
  }

  private setupGlobalListeners(): void {
    // Protection: Auto-pause when user plays a game on PC
    this.protectionService.on('gameLaunched', (gameName) => {
      const anyFarming = Array.from(this.sessions.values()).some((s) => s.isFarming && !s.isPaused);
      if (anyFarming) {
        this.pause('in_game');
        this.log('warning', `Bilgisayarda oyun algılandı (${gameName}), tüm hesaplarda kart düşürme otomatik duraklatıldı.`);
      }
    });

    this.protectionService.on('gameClosed', () => {
      const anyPausedInGame = Array.from(this.sessions.values()).some((s) => s.isFarming && s.isPaused && s.pauseReason === 'in_game');
      if (anyPausedInGame) {
        this.resume();
        this.log('info', `Oyun kapatıldı, kart düşürme kaldığı yerden devam ediyor.`);
      }
    });

    this.localWatcher.start();
    this.protectionService.startProcessMonitor();
  }

  private getOrCreateSession(account: Account): AccountSessionState {
    let session = this.sessions.get(account.id);
    if (session) {
      session.accountName = account.accountName;
      return session;
    }

    const initialSettings = this.db.getSettings();
    const steamClient = new SteamClientWrapper(initialSettings?.personaState || 'invisible');
    const poller = new AdaptivePoller();

    session = {
      accountId: account.id,
      accountName: account.accountName,
      steamClient,
      poller,
      isFarming: false,
      isPaused: false,
      pauseReason: null,
      currentPhase: 'idle',
      sessionElapsedSeconds: 0,
      totalCardsDroppedSession: 0,
      sessionTimer: null,
      currentActiveGamesList: [],
      initialInventoryAssetIds: new Set<string>(),
      sessionDroppedAssetIds: new Set<string>(),
    };

    // Listeners for this session
    const accId = account.id;
    poller.on('checkDue', async () => {
      await this.runCardCheckCycle(accId);
    });

    poller.on('rateLimited', (seconds) => {
      const s = this.sessions.get(accId);
      if (s) {
        s.isPaused = true;
        s.pauseReason = 'rate_limit_429';
      }
      this.log('warning', `[${session!.accountName}] Steam istek limiti aşıldı (HTTP 429). Güvenlik için ${Math.round(seconds / 60)} dakika bekleniyor.`, undefined, accId);
      this.broadcastStatus();
    });

    poller.on('rateLimitResolved', () => {
      const s = this.sessions.get(accId);
      if (s && s.isFarming && s.pauseReason === 'rate_limit_429') {
        s.isPaused = false;
        s.pauseReason = null;
        this.refreshAndEvaluateQueue(accId);
        this.log('info', `[${session!.accountName}] İstek limiti bekleme süresi doldu, kart düşürme devam ediyor.`, undefined, accId);
      }
    });

    poller.on('tick', () => {
      this.broadcastStatus();
    });

    let newItemsDebounceTimer: NodeJS.Timeout | null = null;
    steamClient.on('newItems', (count?: number) => {
      console.log(`[SteamClient] [${session!.accountName}] Steam new inventory notification received (count: ${count ?? 1}). Debouncing inventory check...`);
      if (newItemsDebounceTimer) {
        clearTimeout(newItemsDebounceTimer);
      }
      newItemsDebounceTimer = setTimeout(async () => {
        console.log(`[FarmingEngine] [${session!.accountName}] Debounced newItems check running with fresh inventory fetch...`);
        await this.checkUnrecordedInventoryCards(accId, true);
      }, 3000);
    });

    steamClient.on('currencyDetected', (data: { currencyCode: number; currencySymbol: string; country?: string }) => {
      if (data?.currencySymbol) {
        console.log(`[FarmingEngine] [${session!.accountName}] Currency detected from account country (${data.country || 'auto'}): ${data.currencyCode} -> ${data.currencySymbol} [No wallet check]`);
        this.db.updateSettings({
          currencyCode: data.currencyCode,
          currencySymbol: data.currencySymbol,
        });
        this.broadcastStatus();
      }
    });
    steamClient.on('error', (err: any) => {
      const isSessionReplaced = err?.message?.includes('LogonSessionReplaced') || err?.eresult === 34;
      const isEn = this.db.getSettings().language === 'en';
      if (isSessionReplaced) {
        this.log(
          'warning',
          isEn
            ? `[${session!.accountName}] Steam session was taken over by another client (e.g. Official Steam Client). Farming stopped for this account.`
            : `[${session!.accountName}] Steam oturumu başka bir istemci (örn. Steam masaüstü uygulaması) tarafından devralındı. Kart düşürme bu hesap için durduruldu.`,
          undefined,
          accId
        );
        this.stopSession(accId);
      } else {
        console.warn(`[FarmingEngine] [${session!.accountName}] Steam client error:`, err?.message || err);
      }
      this.broadcastStatus();
    });

    steamClient.on('disconnected', (data: any) => {
      const isSessionReplaced = data?.isSessionReplaced || data?.eresult === 34 || data?.msg?.includes?.('LogonSessionReplaced');
      const isEn = this.db.getSettings().language === 'en';
      if (isSessionReplaced) {
        this.log(
          'warning',
          isEn
            ? `[${session!.accountName}] Steam session was taken over by another client. Farming stopped for this account.`
            : `[${session!.accountName}] Steam oturumu başka bir istemcide açıldığı için kart düşürme durduruldu.`,
          undefined,
          accId
        );
        this.stopSession(accId);
        this.broadcastStatus();
      }
    });

    this.sessions.set(accId, session);
    return session;
  }

  public async fetchAndSaveBadges(accountId: string, refreshToken?: string): Promise<GameQueueItem[]> {
    const rawToken = refreshToken || this.db.getAccountToken(accountId);
    const accounts = this.db.getAccounts();
    const acc = accounts.find((a) => a.id === accountId) || { id: accountId, accountName: accountId, loginType: 'qr', isActive: true, mode: 'standalone', isMaster: false, personaState: 'invisible', status: 'connected', avatarUrl: '' };
    const session = this.getOrCreateSession(acc as Account);
    const badges = await session.steamClient.fetchBadgesData(accountId, rawToken || undefined);
    if (badges.length > 0) {
      this.db.saveGamesBatch(accountId, badges);
      this.emit('queueUpdated', this.db.getQueue(accountId));
    }
    return badges;
  }

  public async ensureConnectedToSteam(accountId?: string): Promise<boolean> {
    const accounts = this.db.getAccounts();
    const targetId = accountId || this.activeAccountId;
    const targetAccount = targetId
      ? accounts.find((a) => a.id === targetId)
      : accounts.find((a) => a.isActive) || accounts[0];

    if (!targetAccount) return false;

    const session = this.getOrCreateSession(targetAccount);

    if (targetAccount.mode === 'standalone') {
      const rawToken = this.db.getAccountToken(targetAccount.id);
      if (rawToken) {
        if (!session.steamClient.getIsCmConnected() || session.steamClient.getCurrentAccountId() !== targetAccount.id) {
          this.log('info', `[${targetAccount.accountName}] Steam ağına bağlanılıyor...`, undefined, targetAccount.id);
          session.steamClient.logOnWithToken(rawToken);
          await session.steamClient.waitForConnection(8000);
        }
        const settings = this.db.getSettings();
        if (settings?.personaState) {
          session.steamClient.setPersonaState(settings.personaState);
        }
        return session.steamClient.getIsCmConnected();
      }
    } else if (targetAccount.loginType === 'cookie') {
      const rawToken = this.db.getAccountToken(targetAccount.id);
      if (rawToken) {
        await session.steamClient.ensureCommunitySession(targetAccount.id, rawToken);
        return true;
      }
    }
    return false;
  }

  public async startFarming(accountId?: string): Promise<boolean> {
    const settings = this.db.getSettings();

    // If a specific account is given, start that account
    if (accountId) {
      this.activeAccountId = accountId;
      return await this.startSession(accountId);
    }

    // If multiInstanceFarming is enabled and no accountId specified, start all accounts
    if (settings.multiInstanceFarming) {
      const accounts = this.db.getAccounts();
      if (accounts.length === 0) {
        this.log('error', 'Farming başlatılamadı: Kayıtlı Steam hesabı bulunamadı.');
        return false;
      }
      let anyStarted = false;
      for (const acc of accounts) {
        const started = await this.startSession(acc.id);
        if (started) anyStarted = true;
      }
      return anyStarted;
    }

    // Standard single account mode
    const accounts = this.db.getAccounts();
    const targetAccount = this.activeAccountId
      ? accounts.find((a) => a.id === this.activeAccountId)
      : accounts.find((a) => a.isActive) || accounts[0];

    if (!targetAccount) {
      this.log('error', 'Farming başlatılamadı: Kayıtlı aktif bir Steam hesabı bulunamadı.');
      return false;
    }

    this.activeAccountId = targetAccount.id;
    return await this.startSession(targetAccount.id);
  }

  public async startSession(accountId: string): Promise<boolean> {
    const accounts = this.db.getAccounts();
    const targetAccount = accounts.find((a) => a.id === accountId);
    if (!targetAccount) return false;

    const session = this.getOrCreateSession(targetAccount);
    session.isFarming = true;
    session.isPaused = false;
    session.pauseReason = null;
    session.sessionElapsedSeconds = 0;
    session.totalCardsDroppedSession = 0;
    session.sessionDroppedAssetIds.clear();
    session.initialInventoryAssetIds.clear();

    // Snapshot previously recorded drops in database so they are never counted as session drops
    const existingDrops = this.db.getCardDrops();
    for (const d of existingDrops) {
      if (d.accountId === accountId && d.assetId) {
        session.initialInventoryAssetIds.add(d.assetId);
      }
    }

    // Snapshot pre-existing live inventory cards so old cards won't be treated as new session drops
    const initialRawToken = this.db.getAccountToken(targetAccount.id);
    session.steamClient.fetchCardInventory(targetAccount.id, initialRawToken || undefined).then((cards) => {
      if (cards && Array.isArray(cards)) {
        for (const c of cards) {
          if (c.assetId) {
            session.initialInventoryAssetIds.add(c.assetId);
          }
        }
      }
    }).catch(() => {});

    // Check if user is currently gaming
    if (this.protectionService.isGamingActive()) {
      session.isPaused = true;
      session.pauseReason = 'in_game';
    }

    // Apply user's preferred Steam Persona State
    const settings = this.db.getSettings();
    if (settings?.personaState) {
      session.steamClient.setPersonaState(settings.personaState);
    }

    // Connect / ensure Steam session
    if (targetAccount.mode === 'standalone') {
      const rawToken = this.db.getAccountToken(targetAccount.id);
      if (rawToken) {
        if (!session.steamClient.getIsCmConnected() || session.steamClient.getCurrentAccountId() !== targetAccount.id) {
          this.log('info', `[${targetAccount.accountName}] Steam ağına bağlanılıyor...`, undefined, targetAccount.id);
          session.steamClient.logOnWithToken(rawToken);
          await session.steamClient.waitForConnection(8000);
        }
        await session.steamClient.ensureCommunitySession(targetAccount.id, rawToken);
        if (settings?.personaState) {
          session.steamClient.setPersonaState(settings.personaState);
        }
      }
    } else if (targetAccount.mode === 'local_client') {
      const rawToken = this.db.getAccountToken(targetAccount.id);
      if (rawToken && rawToken.includes('|')) {
        const [sessionId, steamLoginSecure] = rawToken.split('|');
        session.steamClient.logOnWithCookies(sessionId, steamLoginSecure);
      }
    }

    // Start session timer
    if (session.sessionTimer) clearInterval(session.sessionTimer);
    session.sessionTimer = setInterval(() => {
      if (session.isFarming && !session.isPaused) {
        session.sessionElapsedSeconds++;
      }
    }, 1000);

    this.log('info', `${targetAccount.accountName} hesabı için kart düşürme motoru başlatıldı.`, undefined, targetAccount.id);
    await this.refreshAndEvaluateQueue(targetAccount.id);
    this.broadcastStatus();
    return true;
  }

  public async refreshAndEvaluateQueue(accountId?: string): Promise<void> {
    if (!accountId) {
      const activeIds = Array.from(this.sessions.keys()).filter((id) => this.sessions.get(id)?.isFarming);
      if (activeIds.length > 0) {
        for (const id of activeIds) {
          await this.refreshAndEvaluateQueue(id);
        }
        return;
      }
    }

    const targetId = accountId || this.activeAccountId;
    if (!targetId) return;

    const session = this.sessions.get(targetId);
    if (!session || !session.isFarming || session.isPaused) return;

    const settings = this.db.getSettings();
    let queue = this.db.getQueue(targetId);

    // Filter Hidden/Blacklisted, VAC & Blacklist AppIds
    queue = queue.filter((item) => {
      if (item.isBlacklisted) return false;
      if (settings.filterVacGames && this.protectionService.isVacProtected(item.appId)) {
        return false;
      }
      if (settings.blacklistAppIds && settings.blacklistAppIds.includes(item.appId)) {
        return false;
      }
      return true;
    });

    if (queue.length === 0) {
      const isEn = settings.language === 'en';
      this.log('info', isEn ? `[${session.accountName}] Scanning library badges and games with card drops...` : `[${session.accountName}] Kütüphanedeki rozetler ve kart hakkı olan oyunlar taranıyor...`, undefined, targetId);
      const rawToken = this.db.getAccountToken(targetId);
      const badges = await session.steamClient.fetchBadgesData(targetId, rawToken || undefined);
      if (badges.length > 0) {
        this.db.saveGamesBatch(targetId, badges);
        this.emit('queueUpdated', this.db.getQueue(targetId));
        queue = this.db.getQueue(targetId).filter((item) => {
          if (item.isBlacklisted) return false;
          if (settings.filterVacGames && this.protectionService.isVacProtected(item.appId)) {
            return false;
          }
          if (settings.blacklistAppIds && settings.blacklistAppIds.includes(item.appId)) {
            return false;
          }
          return true;
        });
        this.log(
          'success',
          isEn
            ? `[${session.accountName}] ${badges.length} games with card drops detected.`
            : `[${session.accountName}] ${badges.length} adet kart hakkı olan oyun tespit edildi.`,
          undefined,
          targetId
        );
      }
    }

    if (queue.length === 0) {
      const isEn = settings.language === 'en';
      this.stopSession(targetId);
      this.log(
        'warning',
        isEn
          ? `[${session.accountName}] No games with remaining card drops found in your library or all cards completed.`
          : `[${session.accountName}] Kütüphanenizde kart düşürme hakkı olan oyun bulunmuyor veya tüm kartlar tamamlanmış.`,
        undefined,
        targetId
      );
      this.broadcastStatus();
      return;
    }

    const strategy = settings.idleStrategy || 'smart_hybrid';
    const isEn = settings.language === 'en';

    if (strategy === 'solo_only') {
      session.currentPhase = 'solo_drop';
      const soloGame = queue[0];
      session.currentActiveGamesList = [soloGame];

      session.steamClient.playGames([soloGame.appId]);
      this.log(
        'info',
        isEn
          ? `[${session.accountName}] Solo Idling: Simulating "${soloGame.gameTitle}" (Remaining Cards: ${soloGame.cardsRemaining}).`
          : `[${session.accountName}] Solo Düşürme: "${soloGame.gameTitle}" simüle ediliyor (Kalan Kart: ${soloGame.cardsRemaining}).`,
        soloGame.appId,
        targetId
      );

      session.poller.scheduleNextCheck(
        soloGame.cardsRemaining,
        settings.pollIntervalMultiMinutes,
        settings.pollIntervalSoloMinutes
      );
    } else if (strategy === 'warmup_only') {
      const gamesNeedingWarmup = queue.filter((g) => g.playtimeMinutes < 120);
      if (gamesNeedingWarmup.length === 0) {
        this.stopSession(targetId);
        this.log(
          'success',
          isEn
            ? `[${session.accountName}] Fast Warm-Up complete! All games in your queue have reached 2 hours of playtime.`
            : `[${session.accountName}] Hızlı Ön Isınma tamamlandı! Kuyruktaki tüm oyunlar 2 saatlik oynama süresine ulaştı.`,
          undefined,
          targetId
        );
        this.broadcastStatus();
        return;
      }

      session.currentPhase = 'warmup_32';
      const batchToPlay = gamesNeedingWarmup.slice(0, 32);
      session.currentActiveGamesList = batchToPlay;
      const appIds = batchToPlay.map((g) => g.appId);

      session.steamClient.playGames(appIds);
      this.log(
        'info',
        isEn
          ? `[${session.accountName}] Fast Warm-Up Mode: Warming up ${batchToPlay.length} games to 2 hours simultaneously...`
          : `[${session.accountName}] Hızlı Ön Isınma Modu: ${batchToPlay.length} oyun eşzamanlı olarak 2 saate ulaştırılıyor...`,
        undefined,
        targetId
      );

      session.poller.scheduleNextCheck(
        2,
        settings.pollIntervalMultiMinutes,
        settings.pollIntervalSoloMinutes
      );
    } else if (strategy === 'simultaneous') {
      session.currentPhase = 'simultaneous';
      const batchToPlay = queue.slice(0, 32);
      session.currentActiveGamesList = batchToPlay;
      const appIds = batchToPlay.map((g) => g.appId);

      session.steamClient.playGames(appIds);
      this.log(
        'info',
        isEn
          ? `[${session.accountName}] Simultaneous Idling Mode: Simulating ${batchToPlay.length} games at the same time...`
          : `[${session.accountName}] Eşzamanlı Çoklu Mod: ${batchToPlay.length} oyun aynı anda simüle ediliyor...`,
        undefined,
        targetId
      );

      session.poller.scheduleNextCheck(
        2,
        settings.pollIntervalMultiMinutes,
        settings.pollIntervalSoloMinutes
      );
    } else {
      // Smart Hybrid Mode
      const gamesNeedingWarmup = queue.filter((g) => g.playtimeMinutes < 120);

      if (gamesNeedingWarmup.length > 0) {
        session.currentPhase = 'warmup_32';
        const batchToPlay = gamesNeedingWarmup.slice(0, 32);
        session.currentActiveGamesList = batchToPlay;
        const appIds = batchToPlay.map((g) => g.appId);

        session.steamClient.playGames(appIds);
        this.log(
          'info',
          isEn
            ? `[${session.accountName}] Fast Warm-Up Mode: Simulating ${batchToPlay.length} games (under 2 hours playtime) simultaneously...`
            : `[${session.accountName}] Hızlı Ön Isınma Modu: 2 saatin altındaki ${batchToPlay.length} oyun eşzamanlı olarak 2 saate ulaştırılıyor...`,
          undefined,
          targetId
        );

        session.poller.scheduleNextCheck(
          2,
          settings.pollIntervalMultiMinutes,
          settings.pollIntervalSoloMinutes
        );
      } else {
        session.currentPhase = 'solo_drop';
        const soloGame = queue[0];
        session.currentActiveGamesList = [soloGame];

        session.steamClient.playGames([soloGame.appId]);
        this.log(
          'info',
          isEn
            ? `[${session.accountName}] Smart Solo Idling: Simulating "${soloGame.gameTitle}" (Remaining Cards: ${soloGame.cardsRemaining}).`
            : `[${session.accountName}] Akıllı Solo Düşürme: "${soloGame.gameTitle}" simüle ediliyor (Kalan Kart: ${soloGame.cardsRemaining}).`,
          soloGame.appId,
          targetId
        );

        session.poller.scheduleNextCheck(
          soloGame.cardsRemaining,
          settings.pollIntervalMultiMinutes,
          settings.pollIntervalSoloMinutes
        );
      }
    }

    this.broadcastStatus();
  }

  private async recordDropsForGame(
    appId: number,
    gameTitle: string,
    count: number,
    targetAccountId: string
  ): Promise<void> {
    const settings = this.db.getSettings();
    const session = this.sessions.get(targetAccountId);
    const client = session?.steamClient || this.steamClient;

    try {
      const rawToken = this.db.getAccountToken(targetAccountId);
      const inventoryCards = await client.fetchCardInventory(targetAccountId, rawToken || undefined, false);
      const matchingCards = inventoryCards.filter((c) => c.appId === appId);
      const existingDrops = this.db.getCardDrops();

      let unrecorded = matchingCards.filter(
        (invCard) => !existingDrops.some((d) => d.accountId === targetAccountId && d.appId === appId && d.assetId === invCard.assetId)
      );

      if (unrecorded.length === 0 && matchingCards.length > 0) {
        unrecorded = matchingCards;
      }

      for (let i = 0; i < count; i++) {
        const invCard = unrecorded[i] || matchingCards[i % matchingCards.length];
        const cardName = invCard ? cleanCardName(invCard.cardName, gameTitle) : `${gameTitle} Trading Card`;
        const cardImage = invCard?.cardImage || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
        const assetId = invCard?.assetId || undefined;
        const marketHashName = invCard?.marketHashName || `${appId}-${cardName}`;

        const dropRecord = this.db.recordCardDrop({
          accountId: targetAccountId,
          appId,
          gameTitle,
          cardName,
          marketHashName,
          cardImage,
          assetId,
          isSold: false,
          soldPrice: null,
          isLooted: false,
        });

        const previousCopies = existingDrops.filter(
          (d) => d.accountId === targetAccountId && d.appId === appId && d.cardName === cardName
        ).length;
        const isEn = settings.language === 'en';
        const copyBadgeText = previousCopies > 0 ? (isEn ? ` (${previousCopies + 1}th Copy)` : ` (${previousCopies + 1}. Kopya)`) : '';

        if (session && assetId) {
          session.sessionDroppedAssetIds.add(assetId);
        }

        this.emit('cardDropped', dropRecord);
        this.log('success', isEn ? `🎉 New card dropped! [${gameTitle}: ${cardName}${copyBadgeText}]` : `🎉 Yeni kart düştü! [${gameTitle}: ${cardName}${copyBadgeText}]`, appId, targetAccountId);

        if (settings.autoSellCards) {
          this.handleAutoSell(dropRecord, settings);
        }
      }
    } catch (err) {
      console.warn('[FarmingEngine] recordDropsForGame fallback:', err);
      let badgeCards: Array<{ cardName: string; cardImage: string }> = [];
      try {
        badgeCards = await client.fetchGameCardsMetadata(appId, targetAccountId);
      } catch {
        // Göz ardı et
      }

      const isEn = settings.language === 'en';

      for (let i = 0; i < count; i++) {
        const sample = badgeCards.length > 0 ? badgeCards[i % badgeCards.length] : null;
        const cleanedSampleName = sample ? cleanCardName(sample.cardName, gameTitle) : '';
        const cardName = cleanedSampleName || (isEn ? `${gameTitle} Trading Card` : `${gameTitle} Koleksiyon Kartı`);
        const cardImage = sample?.cardImage || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
        const fallbackKey = `${appId}-${cardName}-${Date.now()}-${i}`;

        const dropRecord = this.db.recordCardDrop({
          accountId: targetAccountId,
          appId,
          gameTitle,
          cardName,
          marketHashName: fallbackKey,
          cardImage,
          isSold: false,
          soldPrice: null,
          isLooted: false,
        });
        this.emit('cardDropped', dropRecord);
        this.log('success', isEn ? `🎉 New card dropped! [${gameTitle}: ${cardName}]` : `🎉 Yeni kart düştü! [${gameTitle}: ${cardName}]`, appId, targetAccountId);
      }
    }
  }

  private async runCardCheckCycle(accountId?: string): Promise<void> {
    const targetId = accountId || this.activeAccountId;
    if (!targetId) return;

    const session = this.sessions.get(targetId);
    if (!session || !session.isFarming || session.isPaused) return;

    const isEn = this.db.getSettings().language === 'en';
    this.log('info', isEn ? `[${session.accountName}] Checking card drop status...` : `[${session.accountName}] Kart düşme durumu denetleniyor...`, undefined, targetId);

    try {
      const rawToken = this.db.getAccountToken(targetId);
      const badges = await session.steamClient.fetchBadgesData(targetId, rawToken || undefined);

      if (!badges) {
        this.log('warning', isEn ? `[${session.accountName}] Steam badge page unaccessible, retrying next cycle.` : `[${session.accountName}] Steam rozet sayfasına erişilemedi, sonraki döngüde tekrar denenecek.`, undefined, targetId);
        return;
      }

      for (const activeGame of session.currentActiveGamesList) {
        const matchingBadge = badges.find((b) => b.appId === activeGame.appId);

        if (matchingBadge) {
          if (matchingBadge.playtimeMinutes > activeGame.playtimeMinutes) {
            this.db.updateGamePlaytimeAndCards(
              targetId,
              activeGame.appId,
              matchingBadge.playtimeMinutes,
              matchingBadge.cardsRemaining
            );
          }

          if (matchingBadge.cardsRemaining < activeGame.cardsRemaining) {
            const droppedCount = activeGame.cardsRemaining - matchingBadge.cardsRemaining;
            session.totalCardsDroppedSession += droppedCount;

            this.db.updateGamePlaytimeAndCards(
              targetId,
              activeGame.appId,
              matchingBadge.playtimeMinutes,
              matchingBadge.cardsRemaining
            );

            await this.recordDropsForGame(activeGame.appId, activeGame.gameTitle, droppedCount, targetId);

            if (matchingBadge.cardsRemaining === 0) {
              this.db.removeGameFromQueue(activeGame.appId);
              this.log('info', isEn ? `✅ "${activeGame.gameTitle}" all cards completed and removed from queue.` : `✅ "${activeGame.gameTitle}" oyununun tüm kartları tamamlandı ve kuyruktan çıkarıldı.`, activeGame.appId, targetId);
            }
          }
        } else {
          const singleStatus = await session.steamClient.checkSingleGameCardDrops(activeGame.appId, targetId);

          if (singleStatus.status === 'confirmed') {
            if (singleStatus.cardsRemaining === 0) {
              if (activeGame.cardsRemaining > 0) {
                const droppedCount = activeGame.cardsRemaining;
                session.totalCardsDroppedSession += droppedCount;
                await this.recordDropsForGame(activeGame.appId, activeGame.gameTitle, droppedCount, targetId);
              }
              this.db.removeGameFromQueue(activeGame.appId);
              this.log('info', isEn ? `✅ "${activeGame.gameTitle}" all cards completed and removed from queue.` : `✅ "${activeGame.gameTitle}" oyununun tüm kartları tamamlandı ve kuyruktan çıkarıldı.`, activeGame.appId, targetId);
            } else if (singleStatus.cardsRemaining < activeGame.cardsRemaining) {
              const droppedCount = activeGame.cardsRemaining - singleStatus.cardsRemaining;
              session.totalCardsDroppedSession += droppedCount;
              this.db.updateGamePlaytimeAndCards(
                targetId,
                activeGame.appId,
                activeGame.playtimeMinutes,
                singleStatus.cardsRemaining
              );
              await this.recordDropsForGame(activeGame.appId, activeGame.gameTitle, droppedCount, targetId);
            }
          }
        }
      }

      this.emit('queueUpdated', this.db.getQueue(targetId));
      await this.refreshAndEvaluateQueue(targetId);
    } catch (err: any) {
      if (err?.message?.includes('429')) {
        session.poller.triggerRateLimit(15);
      } else {
        console.error(`[FarmingEngine] Error in runCardCheckCycle for ${targetId}:`, err);
      }
    }
  }

  private async handleAutoSell(drop: CardDrop, settings: AppSettings): Promise<void> {
    const isEn = settings.language === 'en';
    try {
      const priceInfo = await MarketService.getCardPrice(drop.marketHashName, settings.currencyCode || 1);
      if (priceInfo.success && priceInfo.numericLowestPrice) {
        const currencySymbol = priceInfo.currencySymbol || settings.currencySymbol || '$';
        if (priceInfo.currencySymbol && priceInfo.currencySymbol !== settings.currencySymbol) {
          this.db.updateSettings({ currencySymbol: priceInfo.currencySymbol });
        }
        const listingPrice = MarketService.calculateListingPrice(
          priceInfo.numericLowestPrice,
          settings.autoSellUnderCut
        );
        this.db.markCardSold(drop.id, listingPrice);
        this.log(
          'info',
          isEn
            ? `[Market Sale] Listed "${drop.cardName}" card for sale at ${currencySymbol}${listingPrice}.`
            : `[Pazar Satışı] "${drop.cardName}" kartı ${currencySymbol}${listingPrice} fiyattan satışa listelendi.`,
          drop.appId,
          drop.accountId
        );
      }
    } catch (e) {
      console.warn('Auto sell failed:', e);
    }
  }

  public pause(reason: PauseReason = 'user', accountId?: string): boolean {
    if (accountId) {
      const s = this.sessions.get(accountId);
      if (!s || !s.isFarming || s.isPaused) return false;
      s.isPaused = true;
      s.pauseReason = reason;
      s.steamClient.stopPlaying();
      this.broadcastStatus();
      return true;
    }

    // Pause all
    let anyPaused = false;
    for (const s of this.sessions.values()) {
      if (s.isFarming && !s.isPaused) {
        s.isPaused = true;
        s.pauseReason = reason;
        s.steamClient.stopPlaying();
        anyPaused = true;
      }
    }
    this.localWatcher.stopLocalSimulation();
    this.broadcastStatus();
    return anyPaused;
  }

  public resume(accountId?: string): boolean {
    if (accountId) {
      const s = this.sessions.get(accountId);
      if (!s || !s.isFarming || !s.isPaused) return false;
      s.isPaused = false;
      s.pauseReason = null;
      this.refreshAndEvaluateQueue(accountId);
      this.broadcastStatus();
      return true;
    }

    // Resume all
    let anyResumed = false;
    for (const s of this.sessions.values()) {
      if (s.isFarming && s.isPaused) {
        s.isPaused = false;
        s.pauseReason = null;
        this.refreshAndEvaluateQueue(s.accountId);
        anyResumed = true;
      }
    }
    this.broadcastStatus();
    return anyResumed;
  }

  public stopFarming(accountId?: string): boolean {
    if (accountId) {
      this.stopSession(accountId);
      return true;
    }

    // Stop all sessions
    for (const s of this.sessions.values()) {
      this.stopSession(s.accountId);
    }
    this.localWatcher.stopLocalSimulation();
    this.broadcastStatus();
    return true;
  }

  public stopSession(accountId: string): void {
    const session = this.sessions.get(accountId);
    if (!session) return;

    const lastActiveGames = [...session.currentActiveGamesList];
    session.isFarming = false;
    session.isPaused = false;
    session.pauseReason = null;
    session.currentPhase = 'idle';
    session.currentActiveGamesList = [];
    session.steamClient.stopPlaying();
    session.poller.reset();

    if (session.sessionTimer) {
      clearInterval(session.sessionTimer);
      session.sessionTimer = null;
    }

    const isEn = this.db.getSettings().language === 'en';
    this.log('info', isEn ? `Card farming engine stopped for ${session.accountName}.` : `${session.accountName} hesabı için kart düşürme motoru durduruldu.`, undefined, accountId);
    this.broadcastStatus();

    if (lastActiveGames.length > 0) {
      setTimeout(() => {
        this.runPostStopCheck(lastActiveGames, accountId).catch((err) => {
          console.warn(`[FarmingEngine] Post-stop card check error for ${accountId}:`, err);
        });
      }, 3500);
    }
  }

  private async runPostStopCheck(gamesToCheck: GameQueueItem[], targetAccountId: string): Promise<void> {
    const isEn = this.db.getSettings().language === 'en';
    const rawToken = this.db.getAccountToken(targetAccountId);
    const session = this.sessions.get(targetAccountId);
    const client = session?.steamClient || this.steamClient;

    try {
      const badges = await client.fetchBadgesData(targetAccountId, rawToken || undefined);

      if (badges) {
        for (const game of gamesToCheck) {
          const matchingBadge = badges.find((b) => b.appId === game.appId);
          if (matchingBadge && matchingBadge.cardsRemaining < game.cardsRemaining) {
            const droppedCount = game.cardsRemaining - matchingBadge.cardsRemaining;
            if (session) session.totalCardsDroppedSession += droppedCount;
            this.db.updateGamePlaytimeAndCards(targetAccountId, game.appId, matchingBadge.playtimeMinutes, matchingBadge.cardsRemaining);
            await this.recordDropsForGame(game.appId, game.gameTitle, droppedCount, targetAccountId);
            this.log('success', isEn ? `[${session?.accountName || targetAccountId}] 🎯 Post-stop catch: ${droppedCount} card(s) captured from "${game.gameTitle}".` : `[${session?.accountName || targetAccountId}] 🎯 Durdurma sonrası yakalama: "${game.gameTitle}" oyunundan ${droppedCount} kart yakalandı.`, game.appId, targetAccountId);
          }
        }
      }
      this.broadcastStatus();
    } catch (err) {
      console.warn(`[FarmingEngine] runPostStopCheck failed for ${targetAccountId}:`, err);
    }
  }

  public async checkUnrecordedInventoryCards(accountId?: string, forceFresh = false): Promise<number> {
    const targetId = accountId || this.activeAccountId;
    if (!targetId) return 0;

    const rawToken = this.db.getAccountToken(targetId);
    const session = this.sessions.get(targetId);
    const client = session?.steamClient || this.steamClient;

    try {
      const inventoryCards = await client.fetchCardInventory(targetId, rawToken || undefined, forceFresh);
      if (!inventoryCards || inventoryCards.length === 0) return 0;

      const existingDrops = this.db.getCardDrops();
      const settings = this.db.getSettings();
      const isEn = settings.language === 'en';
      const queue = this.db.getQueue(targetId);
      let newRecordedCount = 0;

      for (const invCard of inventoryCards) {
        if (!invCard.assetId) continue;

        const alreadyRecorded = existingDrops.some(
          (d) => d.accountId === targetId && d.appId === invCard.appId && d.assetId === invCard.assetId
        );

        if (alreadyRecorded) {
          continue;
        }

        // Check if this card was already in user inventory BEFORE this farming session started
        const wasInPreSessionInventory = session && session.initialInventoryAssetIds.has(invCard.assetId);

        // Check if this card has already been counted in this session
        const wasAlreadyCountedInSession = session && session.sessionDroppedAssetIds.has(invCard.assetId);

        // Check if this card belongs to an actively farmed game or queue game
        const isCurrentActiveGame = session?.currentActiveGamesList.some((g) => g.appId === invCard.appId);
        const isQueueGame = queue.some((g) => g.appId === invCard.appId);

        const cardName = cleanCardName(invCard.cardName, invCard.gameTitle);
        const dropRecord = this.db.recordCardDrop({
          accountId: targetId,
          appId: invCard.appId,
          gameTitle: invCard.gameTitle,
          cardName,
          marketHashName: invCard.marketHashName,
          cardImage: invCard.cardImage,
          assetId: invCard.assetId,
          isSold: false,
          soldPrice: null,
          isLooted: false,
        });

        // ONLY count as a new session drop if it was NOT in the inventory before session started,
        // has not been counted yet, and belongs to a farmed game
        if (!wasInPreSessionInventory && !wasAlreadyCountedInSession && (isCurrentActiveGame || isQueueGame)) {
          if (session) {
            session.sessionDroppedAssetIds.add(invCard.assetId);
          }

          // Oyunun veritabanındaki kalan kart sayısını düşür
          const targetGame = queue.find((g) => g.appId === invCard.appId);
          if (targetGame && targetGame.cardsRemaining > 0) {
            const newRemaining = targetGame.cardsRemaining - 1;
            targetGame.cardsRemaining = newRemaining;
            this.db.updateGamePlaytimeAndCards(
              targetId,
              invCard.appId,
              targetGame.playtimeMinutes,
              newRemaining
            );
            if (newRemaining === 0) {
              this.db.removeGameFromQueue(invCard.appId);
              this.log(
                'info',
                isEn
                  ? `✅ "${invCard.gameTitle}" all cards completed and removed from queue.`
                  : `✅ "${invCard.gameTitle}" oyununun tüm kartları tamamlandı ve kuyruktan çıkarıldı.`,
                invCard.appId,
                targetId
              );
            }
          }

          this.emit('cardDropped', dropRecord);
          this.log(
            'success',
            isEn
              ? `[${session?.accountName || targetId}] 🎉 New inventory card detected! [${invCard.gameTitle}: ${cardName}]`
              : `[${session?.accountName || targetId}] 🎉 Envanterde yeni kart algılandı! [${invCard.gameTitle}: ${cardName}]`,
            invCard.appId,
            targetId
          );

          if (settings.autoSellCards) {
            this.handleAutoSell(dropRecord, settings);
          }

          newRecordedCount++;
        }
      }

      if (newRecordedCount > 0) {
        if (session) session.totalCardsDroppedSession += newRecordedCount;
        const updatedQueue = this.db.getQueue(targetId);
        this.emit('queueUpdated', updatedQueue);
        this.broadcastStatus();

        // Eğer aktif simüle edilen oyunun kartları bittiyse sıradaki oyuna geç
        const hasFinishedActive = session?.currentActiveGamesList.some(
          (ag) => !updatedQueue.some((qg) => qg.appId === ag.appId)
        );
        if (hasFinishedActive && session?.isFarming) {
          await this.refreshAndEvaluateQueue(targetId);
        }
      }

      return newRecordedCount;
    } catch (err) {
      console.warn(`[FarmingEngine] checkUnrecordedInventoryCards failed for ${targetId}:`, err);
      return 0;
    }
  }

  public async startFarmingGameNow(appId: number, accountId?: string): Promise<boolean> {
    const targetId = accountId || this.activeAccountId;
    if (!targetId) return false;
    const queue = this.db.getQueue(targetId);
    const target = queue.find((g) => g.appId === appId);
    if (!target) return false;

    const remainingAppIds = queue.filter((g) => g.appId !== appId).map((g) => g.appId);
    this.db.updateQueueOrder([appId, ...remainingAppIds]);

    const session = this.sessions.get(targetId);
    if (session && session.isFarming) {
      await this.refreshAndEvaluateQueue(targetId);
    }
    return true;
  }

  public getStatus(accountId?: string): FarmingStatus {
    const targetId = accountId || this.activeAccountId;
    const session = targetId ? this.sessions.get(targetId) : null;

    const queue = targetId
      ? this.db.getQueue(targetId).filter((g) => !g.isBlacklisted)
      : [];
    const totalRemaining = queue.reduce((acc, curr) => acc + curr.cardsRemaining, 0);
    const totalAllTime = this.db.getTotalDroppedCardsCount(targetId || undefined);

    const isAnyFarming = Array.from(this.sessions.values()).some((s) => s.isFarming);
    const isAnyPaused = Array.from(this.sessions.values()).some((s) => s.isPaused);

    // Build multiStatus for all known accounts
    const multiStatus: Record<string, FarmingStatus> = {};
    const accounts = this.db.getAccounts();
    for (const acc of accounts) {
      const s = this.sessions.get(acc.id);
      const accQueue = this.db.getQueue(acc.id).filter((g) => !g.isBlacklisted);
      const accRemaining = accQueue.reduce((acc, curr) => acc + curr.cardsRemaining, 0);
      const accAllTime = this.db.getTotalDroppedCardsCount(acc.id);

      multiStatus[acc.id] = {
        isFarming: s ? s.isFarming : false,
        isPaused: s ? s.isPaused : false,
        pauseReason: s ? s.pauseReason : null,
        rateLimitCountdownSeconds: s ? s.poller.getRateLimitSeconds() : 0,
        activePhase: s ? s.currentPhase : 'idle',
        idleStrategy: (this.db.getSettings().idleStrategy as any) || 'smart_hybrid',
        activeGames: s
          ? s.currentActiveGamesList.map((g) => ({
              appId: g.appId,
              title: g.gameTitle,
              headerImage: g.headerImage,
              playtimeMinutes: g.playtimeMinutes,
              cardsRemaining: g.cardsRemaining,
            }))
          : [],
        totalCardsRemaining: accRemaining,
        totalCardsDroppedSession: s ? s.totalCardsDroppedSession : 0,
        totalCardsDroppedAllTime: accAllTime,
        sessionElapsedSeconds: s ? s.sessionElapsedSeconds : 0,
        nextCheckSecondsRemaining: s ? s.poller.getNextCheckSeconds() : 0,
        activeAccountId: acc.id,
      };
    }

    return {
      isFarming: session ? session.isFarming : isAnyFarming,
      isPaused: session ? session.isPaused : isAnyPaused,
      pauseReason: session ? session.pauseReason : null,
      rateLimitCountdownSeconds: session ? session.poller.getRateLimitSeconds() : 0,
      activePhase: session ? session.currentPhase : 'idle',
      idleStrategy: (this.db.getSettings().idleStrategy as any) || 'smart_hybrid',
      activeGames: session
        ? session.currentActiveGamesList.map((g) => ({
            appId: g.appId,
            title: g.gameTitle,
            headerImage: g.headerImage,
            playtimeMinutes: g.playtimeMinutes,
            cardsRemaining: g.cardsRemaining,
          }))
        : [],
      totalCardsRemaining: totalRemaining,
      totalCardsDroppedSession: session ? session.totalCardsDroppedSession : 0,
      totalCardsDroppedAllTime: totalAllTime,
      sessionElapsedSeconds: session ? session.sessionElapsedSeconds : 0,
      nextCheckSecondsRemaining: session ? session.poller.getNextCheckSeconds() : 0,
      activeAccountId: targetId,
      multiStatus,
    };
  }

  public isFarmingRunning(): boolean {
    return Array.from(this.sessions.values()).some((s) => s.isFarming);
  }

  public getActiveAccountId(): string | null {
    return this.activeAccountId;
  }

  public setActiveAccountId(id: string | null): void {
    if (this.activeAccountId === id) return;
    this.activeAccountId = id;
    this.broadcastStatus();
  }

  public broadcastStatus(): void {
    this.emit('statusChanged', this.getStatus());
  }
}
