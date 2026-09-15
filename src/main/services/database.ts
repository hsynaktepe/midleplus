import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { Account, GameQueueItem, CardDrop, AppSettings, AppLog } from '../../shared/types';
import { CryptoService } from './crypto';

export class DatabaseService {
  private db: any = null;
  private isFallback = false;
  private fallbackData: {
    accounts: any[];
    games_queue: any[];
    card_drops: any[];
    app_settings: Record<string, string>;
    app_logs: any[];
  } = {
    accounts: [],
    games_queue: [],
    card_drops: [],
    app_settings: {},
    app_logs: [],
  };
  private fallbackFilePath = '';

  constructor() {
    let dbDir = '';
    try {
      dbDir = app ? app.getPath('userData') : path.join(process.cwd(), '.data');
    } catch {
      dbDir = path.join(process.cwd(), '.data');
    }

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.fallbackFilePath = path.join(dbDir, 'midleplus_store.json');

    try {
      const Database = require('better-sqlite3');
      const dbPath = path.join(dbDir, 'idleplus.db');
      this.db = new Database(dbPath);
      this.initTables();
      this.initDefaultSettings();
    } catch (err) {
      console.warn('better-sqlite3 native binding unavailable, using resilient JSON store fallback:', err);
      this.isFallback = true;
      this.loadFallbackStore();
    }
  }

  private loadFallbackStore(): void {
    if (fs.existsSync(this.fallbackFilePath)) {
      try {
        const raw = fs.readFileSync(this.fallbackFilePath, 'utf8');
        this.fallbackData = JSON.parse(raw);
      } catch (e) {
        console.error('Failed to parse fallback JSON store:', e);
      }
    }
    this.initDefaultSettings();
  }

  private saveFallbackStore(): void {
    try {
      fs.writeFileSync(this.fallbackFilePath, JSON.stringify(this.fallbackData, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
      try {
        fs.chmodSync(this.fallbackFilePath, 0o600);
      } catch {
        // Ignored if OS doesn't support unix file mode permissions
      }
    } catch (e) {
      console.error('Failed to write fallback JSON store:', e);
    }
  }

  private initTables(): void {
    if (this.isFallback || !this.db) return;
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        account_name TEXT NOT NULL,
        avatar_url TEXT,
        login_type TEXT NOT NULL,
        encrypted_token TEXT,
        is_active INTEGER DEFAULT 1,
        mode TEXT DEFAULT 'standalone',
        is_master INTEGER DEFAULT 0,
        persona_state TEXT DEFAULT 'invisible',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS games_queue (
        account_id TEXT NOT NULL,
        app_id INTEGER NOT NULL,
        game_title TEXT NOT NULL,
        header_image TEXT,
        cards_remaining INTEGER DEFAULT 0,
        playtime_minutes INTEGER DEFAULT 0,
        is_vac INTEGER DEFAULT 0,
        is_blacklisted INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        estimated_card_price REAL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (account_id, app_id),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS card_drops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL,
        app_id INTEGER NOT NULL,
        game_title TEXT NOT NULL,
        card_name TEXT NOT NULL,
        market_hash_name TEXT,
        card_image TEXT,
        asset_id TEXT,
        dropped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_sold INTEGER DEFAULT 0,
        sold_price REAL,
        is_looted INTEGER DEFAULT 0,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_logs (
        id TEXT PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        account_id TEXT,
        app_id INTEGER
      );
    `);

    try {
      this.db.exec(`ALTER TABLE card_drops ADD COLUMN card_image TEXT;`);
    } catch {
      // column already exists
    }

    try {
      this.db.exec(`ALTER TABLE card_drops ADD COLUMN asset_id TEXT;`);
    } catch {
      // column already exists
    }

    this.repairGenericCardDrops();
  }

  private initDefaultSettings(): void {
    const defaults: Record<string, string> = {
      language: 'tr',
      theme: 'steam',
      darkMode: 'true',
      defaultFarmingMode: 'standalone',
      idleStrategy: 'smart_hybrid',
      autoStartWithWindows: 'false',
      minimizeToTray: 'true',
      autoPauseWhenGameRuns: 'true',
      filterVacGames: 'true',
      personaState: 'invisible',
      pollIntervalMultiMinutes: '15',
      pollIntervalSoloMinutes: '5',
      autoSellCards: 'false',
      autoSellUnderCut: '0.01',
      autoLootToMaster: 'false',
      masterAccountId: '',
      blacklistAppIds: JSON.stringify([730, 440, 570, 252490]),
      multiInstanceFarming: 'false',
    };

    if (this.isFallback) {
      for (const [key, val] of Object.entries(defaults)) {
        if (!this.fallbackData.app_settings[key]) {
          this.fallbackData.app_settings[key] = val;
        }
      }
      this.saveFallbackStore();
    } else {
      const insert = this.db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`);
      const transaction = this.db.transaction(() => {
        for (const [key, val] of Object.entries(defaults)) {
          insert.run(key, val);
        }
      });
      transaction();
    }
  }

  // --- ACCOUNTS ---
  public getAccounts(): Account[] {
    if (this.isFallback) {
      return this.fallbackData.accounts.map((r) => ({
        id: r.id,
        accountName: r.account_name,
        avatarUrl: r.avatar_url || '',
        loginType: r.login_type,
        isActive: Boolean(r.is_active),
        mode: r.mode,
        isMaster: Boolean(r.is_master),
        personaState: r.persona_state || 'invisible',
        status: 'disconnected',
      }));
    }

    const rows = this.db.prepare(`SELECT * FROM accounts ORDER BY created_at DESC`).all() as any[];
    return rows.map((r) => ({
      id: r.id,
      accountName: r.account_name,
      avatarUrl: r.avatar_url || '',
      loginType: r.login_type,
      isActive: Boolean(r.is_active),
      mode: r.mode,
      isMaster: Boolean(r.is_master),
      personaState: r.persona_state || 'invisible',
      status: 'disconnected',
    }));
  }

  public getAccountToken(accountId: string): string {
    if (this.isFallback) {
      const acc = this.fallbackData.accounts.find((a) => a.id === accountId);
      return acc && acc.encrypted_token ? CryptoService.decrypt(acc.encrypted_token) : '';
    }
    const row = this.db.prepare(`SELECT encrypted_token FROM accounts WHERE id = ?`).get(accountId) as any;
    if (!row || !row.encrypted_token) return '';
    return CryptoService.decrypt(row.encrypted_token);
  }

  public saveAccount(account: Partial<Account> & { id: string; rawToken?: string }): void {
    const encrypted = account.rawToken ? CryptoService.encrypt(account.rawToken) : null;

    if (this.isFallback) {
      const idx = this.fallbackData.accounts.findIndex((a) => a.id === account.id);
      const accObj = {
        id: account.id,
        account_name: account.accountName || 'Steam User',
        avatar_url: account.avatarUrl || '',
        login_type: account.loginType || 'qr',
        encrypted_token: encrypted || (idx >= 0 ? this.fallbackData.accounts[idx].encrypted_token : ''),
        is_active: account.isActive !== undefined ? (account.isActive ? 1 : 0) : 1,
        mode: account.mode || 'standalone',
        is_master: account.isMaster ? 1 : 0,
        persona_state: account.personaState || 'invisible',
        created_at: new Date().toISOString(),
      };
      if (idx >= 0) {
        this.fallbackData.accounts[idx] = { ...this.fallbackData.accounts[idx], ...accObj };
      } else {
        this.fallbackData.accounts.push(accObj);
      }
      this.saveFallbackStore();
      return;
    }

    const existing = this.db.prepare(`SELECT id FROM accounts WHERE id = ?`).get(account.id);
    if (existing) {
      this.db.prepare(`
        UPDATE accounts SET
          account_name = COALESCE(?, account_name),
          avatar_url = COALESCE(?, avatar_url),
          login_type = COALESCE(?, login_type),
          encrypted_token = COALESCE(?, encrypted_token),
          is_active = COALESCE(?, is_active),
          mode = COALESCE(?, mode),
          is_master = COALESCE(?, is_master),
          persona_state = COALESCE(?, persona_state)
        WHERE id = ?
      `).run(
        account.accountName ?? null,
        account.avatarUrl ?? null,
        account.loginType ?? null,
        encrypted,
        account.isActive !== undefined ? (account.isActive ? 1 : 0) : null,
        account.mode ?? null,
        account.isMaster !== undefined ? (account.isMaster ? 1 : 0) : null,
        account.personaState ?? null,
        account.id
      );
    } else {
      this.db.prepare(`
        INSERT INTO accounts (id, account_name, avatar_url, login_type, encrypted_token, is_active, mode, is_master, persona_state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        account.id,
        account.accountName || 'Steam User',
        account.avatarUrl || '',
        account.loginType || 'qr',
        encrypted || '',
        account.isActive !== undefined ? (account.isActive ? 1 : 0) : 1,
        account.mode || 'standalone',
        account.isMaster ? 1 : 0,
        account.personaState || 'invisible'
      );
    }
  }

  public deleteAccount(accountId: string): void {
    if (this.isFallback) {
      this.fallbackData.accounts = this.fallbackData.accounts.filter((a) => a.id !== accountId);
      if (this.fallbackData.games_queue) {
        this.fallbackData.games_queue = this.fallbackData.games_queue.filter((g) => g.account_id !== accountId);
      }
      this.saveFallbackStore();
      return;
    }
    const transaction = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM games_queue WHERE account_id = ?`).run(accountId);
      this.db.prepare(`DELETE FROM accounts WHERE id = ?`).run(accountId);
    });
    transaction();
  }

  public setMasterAccount(accountId: string): void {
    if (this.isFallback) {
      this.fallbackData.accounts.forEach((a) => (a.is_master = a.id === accountId ? 1 : 0));
      this.setSetting('masterAccountId', accountId);
      this.saveFallbackStore();
      return;
    }
    const transaction = this.db.transaction(() => {
      this.db.prepare(`UPDATE accounts SET is_master = 0`).run();
      this.db.prepare(`UPDATE accounts SET is_master = 1 WHERE id = ?`).run(accountId);
      this.setSetting('masterAccountId', accountId);
    });
    transaction();
  }

  public setActiveAccount(accountId: string): void {
    if (this.isFallback) {
      this.fallbackData.accounts.forEach((a) => {
        a.is_active = a.id === accountId ? 1 : 0;
      });
      this.saveFallbackStore();
      return;
    }
    const transaction = this.db.transaction(() => {
      this.db.prepare(`UPDATE accounts SET is_active = 0`).run();
      this.db.prepare(`UPDATE accounts SET is_active = 1 WHERE id = ?`).run(accountId);
    });
    transaction();
  }

  // --- QUEUE & GAMES ---
  public getQueue(accountId?: string): GameQueueItem[] {
    if (this.isFallback) {
      let items = this.fallbackData.games_queue.filter((g) => g.cards_remaining > 0);
      if (accountId) items = items.filter((g) => g.account_id === accountId);
      items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      return items.map((r) => ({
        accountId: r.account_id,
        appId: r.app_id,
        gameTitle: r.game_title,
        headerImage: r.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${r.app_id}/header.jpg`,
        cardsRemaining: r.cards_remaining,
        playtimeMinutes: r.playtime_minutes,
        isVac: Boolean(r.is_vac),
        isBlacklisted: Boolean(r.is_blacklisted),
        sortOrder: r.sort_order,
        status: r.status,
        estimatedCardPrice: r.estimated_card_price,
      }));
    }

    const rows = this.db.prepare(`
      SELECT *, (CASE WHEN playtime_minutes < 120 THEN 1 ELSE 0 END) as priority_score
      FROM games_queue
      WHERE cards_remaining > 0 ${accountId ? 'AND account_id = ?' : ''}
      ORDER BY sort_order ASC, priority_score DESC, updated_at ASC
    `).all(...(accountId ? [accountId] : [])) as any[];

    return rows.map((r) => ({
      accountId: r.account_id,
      appId: r.app_id,
      gameTitle: r.game_title,
      headerImage: r.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${r.app_id}/header.jpg`,
      cardsRemaining: r.cards_remaining,
      playtimeMinutes: r.playtime_minutes,
      isVac: Boolean(r.is_vac),
      isBlacklisted: Boolean(r.is_blacklisted),
      sortOrder: r.sort_order,
      status: r.status,
      estimatedCardPrice: r.estimated_card_price,
    }));
  }

  public saveGamesBatch(accountId: string, games: GameQueueItem[]): void {
    if (this.isFallback) {
      for (const g of games) {
        const idx = this.fallbackData.games_queue.findIndex(
          (item) => item.account_id === accountId && item.app_id === g.appId
        );
        const obj = {
          account_id: accountId,
          app_id: g.appId,
          game_title: g.gameTitle,
          header_image: g.headerImage,
          cards_remaining: g.cardsRemaining,
          playtime_minutes: g.playtimeMinutes,
          is_vac: g.isVac ? 1 : 0,
          is_blacklisted: g.isBlacklisted ? 1 : 0,
          sort_order: g.sortOrder || 0,
          status: g.status || 'pending',
          updated_at: new Date().toISOString(),
        };
        if (idx >= 0) this.fallbackData.games_queue[idx] = { ...this.fallbackData.games_queue[idx], ...obj };
        else this.fallbackData.games_queue.push(obj);
      }
      this.saveFallbackStore();
      return;
    }

    const stmt = this.db.prepare(`
      INSERT INTO games_queue (
        account_id, app_id, game_title, header_image, cards_remaining,
        playtime_minutes, is_vac, is_blacklisted, sort_order, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(account_id, app_id) DO UPDATE SET
        cards_remaining = excluded.cards_remaining,
        playtime_minutes = excluded.playtime_minutes,
        game_title = excluded.game_title,
        header_image = excluded.header_image,
        is_vac = excluded.is_vac,
        updated_at = CURRENT_TIMESTAMP
    `);

    const incomingAppIds = games.map((g) => g.appId);
    const transaction = this.db.transaction(() => {
      for (const g of games) {
        stmt.run(
          accountId,
          g.appId,
          g.gameTitle,
          g.headerImage,
          g.cardsRemaining,
          g.playtimeMinutes,
          g.isVac ? 1 : 0,
          g.isBlacklisted ? 1 : 0,
          g.sortOrder || 0,
          g.status || 'pending'
        );
      }

      // Steam rozet listesinde artık yer almayan (kartları biten) oyunları kuyruktan temizle
      if (incomingAppIds.length > 0) {
        const placeholders = incomingAppIds.map(() => '?').join(',');
        this.db.prepare(`
          UPDATE games_queue 
          SET cards_remaining = 0, updated_at = CURRENT_TIMESTAMP 
          WHERE account_id = ? AND app_id NOT IN (${placeholders})
        `).run(accountId, ...incomingAppIds);
      } else {
        this.db.prepare(`
          UPDATE games_queue 
          SET cards_remaining = 0, updated_at = CURRENT_TIMESTAMP 
          WHERE account_id = ?
        `).run(accountId);
      }
    });
    transaction();
  }

  public updateGameStatus(accountId: string, appId: number, status: string): void {
    if (this.isFallback) {
      const g = this.fallbackData.games_queue.find((i) => i.account_id === accountId && i.app_id === appId);
      if (g) {
        g.status = status;
        this.saveFallbackStore();
      }
      return;
    }
    this.db.prepare(`UPDATE games_queue SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = ? AND app_id = ?`).run(status, accountId, appId);
  }

  public updateGamePlaytimeAndCards(accountId: string, appId: number, playtimeMinutes: number, cardsRemaining: number): void {
    if (this.isFallback) {
      const g = this.fallbackData.games_queue.find((i) => i.account_id === accountId && i.app_id === appId);
      if (g) {
        g.playtime_minutes = playtimeMinutes;
        g.cards_remaining = cardsRemaining;
        this.saveFallbackStore();
      }
      return;
    }
    this.db.prepare(`UPDATE games_queue SET playtime_minutes = ?, cards_remaining = ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = ? AND app_id = ?`).run(playtimeMinutes, cardsRemaining, accountId, appId);
  }

  public updateQueueOrder(appIdsInOrder: number[]): void {
    if (this.isFallback) {
      appIdsInOrder.forEach((appId, index) => {
        const g = this.fallbackData.games_queue.find((item) => item.app_id === appId);
        if (g) g.sort_order = index;
      });
      this.saveFallbackStore();
      return;
    }
    const stmt = this.db.prepare(`UPDATE games_queue SET sort_order = ? WHERE app_id = ?`);
    const transaction = this.db.transaction(() => {
      appIdsInOrder.forEach((appId, index) => {
        stmt.run(index, appId);
      });
    });
    transaction();
  }

  public removeGameFromQueue(appId: number): void {
    if (this.isFallback) {
      const g = this.fallbackData.games_queue.find((item) => item.app_id === appId);
      if (g) {
        g.cards_remaining = 0;
        g.status = 'completed';
        this.saveFallbackStore();
      }
      return;
    }
    this.db.prepare(`UPDATE games_queue SET cards_remaining = 0, status = 'completed' WHERE app_id = ?`).run(appId);
  }

  public toggleGameBlacklist(appId: number, isBlacklisted: boolean): void {
    if (this.isFallback) {
      const g = this.fallbackData.games_queue.find((item) => item.app_id === appId);
      if (g) {
        g.is_blacklisted = isBlacklisted ? 1 : 0;
        this.saveFallbackStore();
      }
      return;
    }
    this.db.prepare(`UPDATE games_queue SET is_blacklisted = ? WHERE app_id = ?`).run(isBlacklisted ? 1 : 0, appId);
  }

  public toggleAllGamesBlacklist(accountId?: string, isBlacklisted: boolean = true): void {
    if (this.isFallback) {
      for (const g of this.fallbackData.games_queue) {
        if (!accountId || g.account_id === accountId) {
          g.is_blacklisted = isBlacklisted ? 1 : 0;
        }
      }
      this.saveFallbackStore();
      return;
    }
    if (accountId) {
      this.db.prepare(`UPDATE games_queue SET is_blacklisted = ? WHERE account_id = ?`).run(isBlacklisted ? 1 : 0, accountId);
    } else {
      this.db.prepare(`UPDATE games_queue SET is_blacklisted = ?`).run(isBlacklisted ? 1 : 0);
    }
  }

  // --- CARD DROPS ---
  public recordCardDrop(drop: Omit<CardDrop, 'id' | 'droppedAt'>): CardDrop {
    const timestamp = new Date().toISOString();
    if (this.isFallback) {
      // Fallback: Eğer assetId verilmişse aynı hesap + assetId kontrolü yap
      if (drop.assetId) {
        const existing = this.fallbackData.card_drops.find(
          (d) => d.account_id === drop.accountId && d.asset_id === drop.assetId
        );
        if (existing) {
          return {
            id: existing.id,
            accountId: existing.account_id,
            appId: existing.app_id,
            gameTitle: existing.game_title,
            cardName: existing.card_name,
            marketHashName: existing.market_hash_name,
            cardImage: existing.card_image || undefined,
            assetId: existing.asset_id || undefined,
            droppedAt: existing.dropped_at,
            isSold: Boolean(existing.is_sold),
            soldPrice: existing.sold_price,
            isLooted: Boolean(existing.is_looted),
          };
        }
      }
      const id = this.fallbackData.card_drops.length + 1;
      const rec = {
        id,
        account_id: drop.accountId,
        app_id: drop.appId,
        game_title: drop.gameTitle,
        card_name: drop.cardName,
        market_hash_name: drop.marketHashName || drop.cardName,
        card_image: drop.cardImage || null,
        asset_id: drop.assetId || null,
        is_sold: drop.isSold ? 1 : 0,
        sold_price: drop.soldPrice || null,
        is_looted: drop.isLooted ? 1 : 0,
        dropped_at: timestamp,
      };
      this.fallbackData.card_drops.unshift(rec);
      this.saveFallbackStore();
      return { id, droppedAt: timestamp, ...drop };
    }

    // SQLite: Eğer assetId verilmişse aynı hesap + assetId varsa ekleme yapma (aynı fiziksel envanter kartı)
    if (drop.assetId) {
      const existingRow = this.db.prepare(
        `SELECT * FROM card_drops WHERE account_id = ? AND asset_id = ? LIMIT 1`
      ).get(drop.accountId, drop.assetId) as any;

      if (existingRow) {
        return {
          id: existingRow.id,
          accountId: existingRow.account_id,
          appId: existingRow.app_id,
          gameTitle: existingRow.game_title,
          cardName: existingRow.card_name,
          marketHashName: existingRow.market_hash_name,
          cardImage: existingRow.card_image || undefined,
          assetId: existingRow.asset_id || undefined,
          droppedAt: existingRow.dropped_at,
          isSold: Boolean(existingRow.is_sold),
          soldPrice: existingRow.sold_price,
          isLooted: Boolean(existingRow.is_looted),
        };
      }
    }

    // Aynı kart türünden (marketHashName) 2. veya 3. kez düşebilir (farklı assetId veya yeni drop).
    // Bu meşru bir kart düşüşüdür, engellenmez ve kaydedilir.
    const res = this.db.prepare(`
      INSERT INTO card_drops (account_id, app_id, game_title, card_name, market_hash_name, card_image, asset_id, is_sold, sold_price, is_looted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      drop.accountId,
      drop.appId,
      drop.gameTitle,
      drop.cardName,
      drop.marketHashName || drop.cardName,
      drop.cardImage || null,
      drop.assetId || null,
      drop.isSold ? 1 : 0,
      drop.soldPrice || null,
      drop.isLooted ? 1 : 0
    );

    return {
      id: Number(res.lastInsertRowid),
      droppedAt: timestamp,
      ...drop,
    };
  }

  public updateCardDropAssetId(
    dropId: number,
    assetId: string,
    cardName?: string,
    cardImage?: string,
    marketHashName?: string
  ): void {
    if (this.isFallback) {
      const d = this.fallbackData.card_drops.find((i) => i.id === dropId);
      if (d) {
        d.asset_id = assetId;
        if (cardName) d.card_name = cardName;
        if (cardImage) d.card_image = cardImage;
        if (marketHashName) d.market_hash_name = marketHashName;
        this.saveFallbackStore();
      }
      return;
    }
    const updates: string[] = ['asset_id = ?'];
    const params: any[] = [assetId];
    if (cardName) {
      updates.push('card_name = ?');
      params.push(cardName);
    }
    if (cardImage) {
      updates.push('card_image = ?');
      params.push(cardImage);
    }
    if (marketHashName) {
      updates.push('market_hash_name = ?');
      params.push(marketHashName);
    }
    params.push(dropId);
    this.db.prepare(`UPDATE card_drops SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  /**
   * Veritabanındaki gerçek mükerrer kayıtları temizler.
   * Aynı account_id + asset_id'ye sahip kayıtlar varsa sadece en eskisini tutar.
   * asset_id'si olmayan fallback kayıtlarda ise aynı saniyede açılmış çift kayıtları temizler.
   * NOT: Farklı assetId'ye sahip aynı isimli kartlar (aynı kartın tekrar düşüşü) asla silinmez!
   */
  public deduplicateCardDrops(): number {
    if (this.isFallback) {
      const seenAssetIds = new Set<string>();
      const seenNullKeys = new Set<string>();
      const unique: any[] = [];
      let removed = 0;
      for (const d of [...this.fallbackData.card_drops].reverse()) {
        if (d.asset_id) {
          const key = `${d.account_id}::${d.asset_id}`;
          if (seenAssetIds.has(key)) {
            removed++;
            continue;
          }
          seenAssetIds.add(key);
        } else {
          const key = `${d.account_id}::${d.app_id}::${d.market_hash_name}::${d.dropped_at}`;
          if (seenNullKeys.has(key)) {
            removed++;
            continue;
          }
          seenNullKeys.add(key);
        }
        unique.unshift(d);
      }
      this.fallbackData.card_drops = unique;
      this.saveFallbackStore();
      return removed;
    }
    try {
      // 1. asset_id'si olan kayıtlar için sadece aynı asset_id'ye sahip mükerrerleri sil
      const resAsset = this.db.prepare(`
        DELETE FROM card_drops
        WHERE asset_id IS NOT NULL AND asset_id != ''
          AND id NOT IN (
            SELECT MIN(id) FROM card_drops
            WHERE asset_id IS NOT NULL AND asset_id != ''
            GROUP BY account_id, asset_id
          )
      `).run();

      // 2. asset_id'si null olan fallback kayıtlardan tamamen aynı saniyede eklenmiş çiftleri temizle
      const resNull = this.db.prepare(`
        DELETE FROM card_drops
        WHERE (asset_id IS NULL OR asset_id = '')
          AND id NOT IN (
            SELECT MIN(id) FROM card_drops
            WHERE (asset_id IS NULL OR asset_id = '')
            GROUP BY account_id, app_id, market_hash_name, dropped_at
          )
      `).run();

      return (resAsset.changes || 0) + (resNull.changes || 0);
    } catch {
      return 0;
    }
  }

  /**
   * Veritabanında generic kalmış veya "Unravel Two Koleksiyon Kartı" gibi geçici isimlerle kaydedilmiş
   * kart kayıtlarını tespit edip gerçek kart isimlerine ("Launch") ve Steam CDN görsellerine onarır.
   */
  public repairGenericCardDrops(): void {
    const unravelLaunchImage =
      'https://community.cloudflare.steamstatic.com/economy/image/IzMF03bk9WpSBq-S-ekoE33L-iLqGFHVaU25ZzQNQcXdA3g5gMEPvUZZEfSMJ6dESN8p_2SVTY7V2NgNxnYJnz4QPivs0XEwSeR5NsjOhgz2oOWIQSygaTPGKnXdGAkwS-BaNGje-2bwsL-cRGuaE-F_EVtQLqAA-2BMOp2Xf0xqwtVUuWG9hXt0Excvd5gScVi6mndAMuwhnHZHJ5JVmHfxIsDZgF40bRdoXL3iB73EPYKgk3wiQ1o5SLZcaYkz4TzkxA/360fx360f';

    if (this.isFallback) {
      for (const d of this.fallbackData.card_drops) {
        if (d.app_id === 1225570 && (d.card_name.includes('Koleksiyon Kartı') || d.card_name === 'Unravel Two' || d.card_name.includes('Trading Card'))) {
          d.card_name = 'Launch';
          d.market_hash_name = '1225570-Launch';
          d.card_image = unravelLaunchImage;
        } else if (d.card_name && d.card_name.includes('Koleksiyon Kartı') && d.card_name.startsWith(d.game_title)) {
          const cleaned = d.card_name.replace(d.game_title, '').replace(/Koleksiyon Kartı/gi, '').trim();
          if (cleaned) d.card_name = cleaned;
        }
      }
      this.saveFallbackStore();
      return;
    }

    try {
      // 1. Unravel Two (1225570) özel onarımı: "Unravel Two Koleksiyon Kartı" olan kaydı "Launch" ve gerçek dikey görseliyle güncelle
      this.db.prepare(`
        UPDATE card_drops
        SET card_name = 'Launch',
            market_hash_name = '1225570-Launch',
            card_image = ?
        WHERE app_id = 1225570
          AND (card_name LIKE '%Koleksiyon Kartı%' OR card_name = 'Unravel Two' OR card_name LIKE '%Trading Card%')
      `).run(unravelLaunchImage);

      // 2. Diğer oyunlarda "Oyun Adı Koleksiyon Kartı" şeklinde kalmış olan genel kayıtları temizle
      const genericRows = this.db.prepare(`
        SELECT id, app_id, game_title, card_name FROM card_drops
        WHERE card_name LIKE '%Koleksiyon Kartı%' OR card_name LIKE '%Trading Card%'
      `).all() as Array<{ id: number; app_id: number; game_title: string; card_name: string }>;

      for (const row of genericRows) {
        if (row.app_id !== 1225570) {
          const cleaned = row.card_name
            .replace(row.game_title, '')
            .replace(/\s*\((?:Koleksiyon Kartı|Trading Card)\)/gi, '')
            .replace(/\s*(?:Koleksiyon Kartı|Trading Card)$/gi, '')
            .trim();
          if (cleaned && cleaned.length > 0) {
            this.db.prepare(`UPDATE card_drops SET card_name = ? WHERE id = ?`).run(cleaned, row.id);
          }
        }
      }
    } catch (err) {
      console.warn('repairGenericCardDrops warning:', err);
    }
  }

  /**
   * Koleksiyon kartı olmayan nesneleri (çıkartmalar, ifadeler, arka planlar vb.)
   * ve henüz kart düşmeden sahte olarak oluşturulmuş generic kopya kayıtlarını veritabanından temizler.
   */
  public cleanNonCardDrops(accountId?: string): number {
    let removedCount = 0;

    const invalidKeywords = [
      'çıkartma', 'sticker', 'ifade', 'emoticon', 'arka plan', 'background',
      'cevher', 'gem', 'booster', 'hızlandırma', 'paket', 'chat effect', 'sohbet efekti',
      'avatar', 'çerçeve', 'frame'
    ];

    const invalidGameTitles = [
      'kış koleksiyonu - 2019',
      'ilk koleksiyon',
      'kendi kaderinizi çizin'
    ];

    const invalidCardNames = [
      'evreka!',
      'üzgün (steam)',
      'biraz daha ağla',
      'kurşun zehirlenmesi!'
    ];

    if (this.isFallback) {
      const initialLen = this.fallbackData.card_drops.length;
      this.fallbackData.card_drops = this.fallbackData.card_drops.filter((d) => {
        if (accountId && d.account_id !== accountId) return true;

        const cardLower = (d.card_name || '').toLowerCase();
        const gameLower = (d.game_title || '').toLowerCase();
        const hashLower = (d.market_hash_name || '').toLowerCase();

        if (invalidGameTitles.some((t) => gameLower.includes(t))) return false;
        if (invalidCardNames.some((c) => cardLower.includes(c))) return false;
        if (invalidKeywords.some((k) => cardLower.includes(k) || hashLower.includes(k))) return false;

        // asset_id'si olmayan ve generic kopya olarak kalmış sahte kayıtlar (örn: Mortal Kombat 1 Koleksiyon Kartı)
        if (!d.asset_id && (cardLower.includes('koleksiyon kartı') || cardLower.includes('trading card'))) {
          return false;
        }

        return true;
      });
      removedCount = initialLen - this.fallbackData.card_drops.length;
      if (removedCount > 0) this.saveFallbackStore();
      return removedCount;
    }

    try {
      let changes1 = 0;
      let changes2 = 0;

      // 1. Bilinen çıkartma oyunları veya kart adlarını sil (Tamamen statik SQL parametreli sorgular)
      if (accountId) {
        const res1 = this.db.prepare(`
          DELETE FROM card_drops
          WHERE account_id = ? AND (
            game_title IN ('Kış Koleksiyonu - 2019', 'İlk Koleksiyon', 'Kendi Kaderinizi Çizin')
            OR card_name IN ('Evreka!', 'Üzgün (Steam)', 'Biraz Daha Ağla', 'Kurşun Zehirlenmesi!')
            OR card_name LIKE '%çıkartma%'
            OR card_name LIKE '%sticker%'
            OR card_name LIKE '%ifade%'
            OR card_name LIKE '%emoticon%'
            OR card_name LIKE '%arka plan%'
            OR market_hash_name LIKE '%sticker%'
            OR market_hash_name LIKE '%emoticon%'
            OR market_hash_name LIKE '%background%'
            OR market_hash_name LIKE '%çıkartma%'
          )
        `).run(accountId);
        changes1 = res1.changes || 0;

        const res2 = this.db.prepare(`
          DELETE FROM card_drops
          WHERE (asset_id IS NULL OR asset_id = '')
            AND (card_name LIKE '%Koleksiyon Kartı%' OR card_name LIKE '%Trading Card%')
            AND account_id = ?
        `).run(accountId);
        changes2 = res2.changes || 0;
      } else {
        const res1 = this.db.prepare(`
          DELETE FROM card_drops
          WHERE game_title IN ('Kış Koleksiyonu - 2019', 'İlk Koleksiyon', 'Kendi Kaderinizi Çizin')
            OR card_name IN ('Evreka!', 'Üzgün (Steam)', 'Biraz Daha Ağla', 'Kurşun Zehirlenmesi!')
            OR card_name LIKE '%çıkartma%'
            OR card_name LIKE '%sticker%'
            OR card_name LIKE '%ifade%'
            OR card_name LIKE '%emoticon%'
            OR card_name LIKE '%arka plan%'
            OR market_hash_name LIKE '%sticker%'
            OR market_hash_name LIKE '%emoticon%'
            OR market_hash_name LIKE '%background%'
            OR market_hash_name LIKE '%çıkartma%'
        `).run();
        changes1 = res1.changes || 0;

        const res2 = this.db.prepare(`
          DELETE FROM card_drops
          WHERE (asset_id IS NULL OR asset_id = '')
            AND (card_name LIKE '%Koleksiyon Kartı%' OR card_name LIKE '%Trading Card%')
        `).run();
        changes2 = res2.changes || 0;
      }

      removedCount = changes1 + changes2;
      return removedCount;
    } catch (err) {
      console.warn('cleanNonCardDrops warning:', err);
      return 0;
    }
  }

  public getCardDrops(): CardDrop[] {
    this.cleanNonCardDrops();
    this.repairGenericCardDrops();

    if (this.isFallback) {
      return this.fallbackData.card_drops.slice(0, 500).map((r) => ({
        id: r.id,
        accountId: r.account_id,
        appId: r.app_id,
        gameTitle: r.game_title,
        cardName: r.card_name,
        marketHashName: r.market_hash_name,
        cardImage: r.card_image || undefined,
        assetId: r.asset_id || undefined,
        droppedAt: r.dropped_at,
        isSold: Boolean(r.is_sold),
        soldPrice: r.sold_price,
        isLooted: Boolean(r.is_looted),
      }));
    }

    const rows = this.db.prepare(`SELECT * FROM card_drops ORDER BY dropped_at DESC LIMIT 500`).all() as any[];
    return rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      appId: r.app_id,
      gameTitle: r.game_title,
      cardName: r.card_name,
      marketHashName: r.market_hash_name,
      cardImage: r.card_image || undefined,
      assetId: r.asset_id || undefined,
      droppedAt: r.dropped_at,
      isSold: Boolean(r.is_sold),
      soldPrice: r.sold_price,
      isLooted: Boolean(r.is_looted),
    }));
  }

  public clearCardDrops(accountId?: string): void {
    if (this.isFallback) {
      if (accountId) {
        this.fallbackData.card_drops = this.fallbackData.card_drops.filter((d) => d.account_id !== accountId);
      } else {
        this.fallbackData.card_drops = [];
      }
      this.saveFallbackStore();
      return;
    }
    if (accountId) {
      this.db.prepare(`DELETE FROM card_drops WHERE account_id = ?`).run(accountId);
    } else {
      this.db.prepare(`DELETE FROM card_drops`).run();
    }
  }

  public getTotalDroppedCardsCount(accountId?: string): number {
    if (this.isFallback) {
      if (accountId) {
        return this.fallbackData.card_drops.filter((d) => d.account_id === accountId).length;
      }
      return this.fallbackData.card_drops.length;
    }
    try {
      if (accountId) {
        const row = this.db.prepare(`SELECT COUNT(*) as count FROM card_drops WHERE account_id = ?`).get(accountId) as any;
        return row ? row.count : 0;
      }
      const row = this.db.prepare(`SELECT COUNT(*) as count FROM card_drops`).get() as any;
      return row ? row.count : 0;
    } catch {
      return 0;
    }
  }

  public markCardSold(dropId: number, price: number): void {
    if (this.isFallback) {
      const d = this.fallbackData.card_drops.find((i) => i.id === dropId);
      if (d) {
        d.is_sold = 1;
        d.sold_price = price;
        this.saveFallbackStore();
      }
      return;
    }
    this.db.prepare(`UPDATE card_drops SET is_sold = 1, sold_price = ? WHERE id = ?`).run(price, dropId);
  }

  public markCardLooted(dropId: number): void {
    if (this.isFallback) {
      const d = this.fallbackData.card_drops.find((i) => i.id === dropId);
      if (d) {
        d.is_looted = 1;
        this.saveFallbackStore();
      }
      return;
    }
    this.db.prepare(`UPDATE card_drops SET is_looted = 1 WHERE id = ?`).run(dropId);
  }

  // --- SETTINGS ---
  public getSettings(): AppSettings {
    const map: Record<string, string> = this.isFallback
      ? { ...this.fallbackData.app_settings }
      : {};

    if (!this.isFallback) {
      const rows = this.db.prepare(`SELECT key, value FROM app_settings`).all() as any[];
      rows.forEach((r) => (map[r.key] = r.value));
    }

    let blacklist: number[] = [];
    try {
      blacklist = map.blacklistAppIds ? JSON.parse(map.blacklistAppIds) : [];
    } catch {
      blacklist = [];
    }

    return {
      language: (map.language as 'tr' | 'en') || 'tr',
      theme: (map.theme as any) || 'steam',
      darkMode: map.darkMode !== 'false',
      defaultFarmingMode: (map.defaultFarmingMode as any) || 'standalone',
      idleStrategy: (map.idleStrategy as any) || 'smart_hybrid',
      autoStartWithWindows: map.autoStartWithWindows === 'true',
      minimizeToTray: map.minimizeToTray !== 'false',
      autoPauseWhenGameRuns: map.autoPauseWhenGameRuns !== 'false',
      filterVacGames: map.filterVacGames !== 'false',
      personaState: (map.personaState as any) || 'invisible',
      pollIntervalMultiMinutes: Number(map.pollIntervalMultiMinutes) || 15,
      pollIntervalSoloMinutes: Number(map.pollIntervalSoloMinutes) || 5,
      autoSellCards: map.autoSellCards === 'true',
      autoSellUnderCut: Math.round((Number(map.autoSellUnderCut) || 0.01) * 100) / 100,
      autoLootToMaster: map.autoLootToMaster === 'true',
      masterAccountId: map.masterAccountId || null,
      blacklistAppIds: blacklist,
      currencyCode: Number(map.currencyCode) || 1,
      currencySymbol: map.currencySymbol || '$',
      multiInstanceFarming: map.multiInstanceFarming === 'true',
    };
  }

  public setSetting(key: string, value: any): void {
    let finalVal = value;
    if (key === 'autoSellUnderCut' && typeof value === 'number') {
      finalVal = Math.round(value * 100) / 100;
    }
    const strVal = typeof finalVal === 'object' ? JSON.stringify(finalVal) : String(finalVal);
    if (this.isFallback) {
      this.fallbackData.app_settings[key] = strVal;
      this.saveFallbackStore();
      return;
    }
    this.db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(key, strVal);
  }

  public updateSettings(settings: Partial<AppSettings>): AppSettings {
    if (settings.autoSellUnderCut !== undefined) {
      settings.autoSellUnderCut = Math.round(Number(settings.autoSellUnderCut) * 100) / 100;
    }
    if (this.isFallback) {
      for (const [key, val] of Object.entries(settings)) {
        this.setSetting(key, val);
      }
      return this.getSettings();
    }
    const transaction = this.db.transaction(() => {
      for (const [key, val] of Object.entries(settings)) {
        this.setSetting(key, val);
      }
    });
    transaction();
    return this.getSettings();
  }

  // --- LOGS ---
  public addLog(log: Omit<AppLog, 'id' | 'timestamp'>): AppLog {
    const id = Math.random().toString(36).substring(2, 9);
    const timestamp = new Date().toISOString();

    if (this.isFallback) {
      const rec = { id, timestamp, ...log };
      this.fallbackData.app_logs.unshift(rec);
      if (this.fallbackData.app_logs.length > 200) this.fallbackData.app_logs.pop();
      this.saveFallbackStore();
      return rec;
    }

    this.db.prepare(`
      INSERT INTO app_logs (id, timestamp, level, message, account_id, app_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, timestamp, log.level, log.message, log.accountId || null, log.appId || null);

    return { id, timestamp, ...log };
  }

  public getLogs(): AppLog[] {
    if (this.isFallback) {
      return this.fallbackData.app_logs.slice(0, 150).map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        level: r.level,
        message: r.message,
        accountId: r.account_id,
        appId: r.app_id,
      }));
    }
    const rows = this.db.prepare(`SELECT * FROM app_logs ORDER BY timestamp DESC LIMIT 150`).all() as any[];
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      level: r.level as any,
      message: r.message,
      accountId: r.account_id,
      appId: r.app_id,
    }));
  }

  public clearLogs(): void {
    if (this.isFallback) {
      this.fallbackData.app_logs = [];
      this.saveFallbackStore();
      return;
    }
    this.db.prepare(`DELETE FROM app_logs`).run();
  }
}
