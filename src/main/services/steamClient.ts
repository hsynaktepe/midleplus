/// <reference path="../declarations.d.ts" />
import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import QRCode from 'qrcode';
import EventEmitter from 'events';
import os from 'os';
import { GameQueueItem, Account, PersonaState } from '../../shared/types';

export function cleanCardName(rawName: string, gameTitle?: string): string {
  if (!rawName) return '';
  let cleaned = rawName
    .replace(/\s*\((?:Koleksiyon Kartı|Trading Card|Foil Trading Card|Parlak Koleksiyon Kartı|Foil|Parlak)\)/gi, '')
    .replace(/\s*-(?:Koleksiyon Kartı|Trading Card|Foil Trading Card|Parlak Koleksiyon Kartı|Foil|Parlak)$/gi, '')
    .replace(/\s*(?:Koleksiyon Kartı|Trading Card|Foil Trading Card|Parlak Koleksiyon Kartı)$/gi, '')
    .trim();

  if (gameTitle && cleaned.toLowerCase() === gameTitle.toLowerCase()) {
    return '';
  }
  return cleaned;
}

export function getCurrencySymbol(currencyCode: number): string {
  switch (currencyCode) {
    case 1:
      return '$'; // USD (United States, LATAM-USD, MENA-USD)
    case 2:
      return '£'; // GBP
    case 3:
      return '€'; // EUR
    case 5:
      return '₽'; // RUB
    case 17:
      return '₺'; // TRY (Legacy)
    case 23:
      return 'R$'; // BRL
    case 24:
      return 'CDN$'; // CAD
    case 25:
      return 'A$'; // AUD
    default:
      return '$';
  }
}

export interface DetectedCurrencyInfo {
  currencyCode: number;
  currencySymbol: string;
  country?: string;
}

/**
 * Cüzdana (wallet bakiyesine / API'sine) bakmadan kullanıcının Steam mağaza ülkesine göre
 * resmi para birimi kodunu ve sembolünü belirler.
 */
export function getCurrencyFromCountry(countryCode?: string): DetectedCurrencyInfo {
  if (!countryCode) {
    return { currencyCode: 1, currencySymbol: '$', country: 'US' };
  }
  const code = countryCode.toUpperCase().trim();

  // Euro bölgesi ülkeleri
  const euroCountries = [
    'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI',
    'GR', 'SK', 'EE', 'LV', 'LT', 'SI', 'CY', 'MT', 'LU'
  ];

  if (euroCountries.includes(code)) {
    return { currencyCode: 3, currencySymbol: '€', country: code };
  }

  switch (code) {
    case 'GB':
      return { currencyCode: 2, currencySymbol: '£', country: code };
    case 'RU':
      return { currencyCode: 5, currencySymbol: '₽', country: code };
    case 'PL':
      return { currencyCode: 6, currencySymbol: 'zł', country: code };
    case 'BR':
      return { currencyCode: 7, currencySymbol: 'R$', country: code };
    case 'JP':
      return { currencyCode: 8, currencySymbol: '¥', country: code };
    case 'NO':
      return { currencyCode: 9, currencySymbol: 'kr', country: code };
    case 'ID':
      return { currencyCode: 10, currencySymbol: 'Rp', country: code };
    case 'MY':
      return { currencyCode: 11, currencySymbol: 'RM', country: code };
    case 'PH':
      return { currencyCode: 12, currencySymbol: '₱', country: code };
    case 'SG':
      return { currencyCode: 13, currencySymbol: 'S$', country: code };
    case 'TH':
      return { currencyCode: 14, currencySymbol: '฿', country: code };
    case 'VN':
      return { currencyCode: 15, currencySymbol: '₫', country: code };
    case 'KR':
      return { currencyCode: 16, currencySymbol: '₩', country: code };
    case 'UA':
      return { currencyCode: 18, currencySymbol: '₴', country: code };
    case 'MX':
      return { currencyCode: 19, currencySymbol: 'Mex$', country: code };
    case 'CA':
      return { currencyCode: 20, currencySymbol: 'CDN$', country: code };
    case 'AU':
      return { currencyCode: 21, currencySymbol: 'A$', country: code };
    case 'NZ':
      return { currencyCode: 22, currencySymbol: 'NZ$', country: code };
    case 'CN':
      return { currencyCode: 23, currencySymbol: '¥', country: code };
    case 'IN':
      return { currencyCode: 24, currencySymbol: '₹', country: code };
    case 'TR':
      // Steam Türkiye Kasım 2023'ten beri MENA-USD (USD / $) kullanmaktadır.
      return { currencyCode: 1, currencySymbol: '$', country: code };
    case 'US':
    default:
      return { currencyCode: 1, currencySymbol: '$', country: code };
  }
}

export class SteamClientWrapper extends EventEmitter {
  public user: any;
  public community: any;
  private currentAccountId: string | null = null;
  private isConnected = false;
  private isCmConnected = false;
  private communityCookiesSet = false;
  private currentActiveGames: number[] = [];

  private preferredPersonaState: PersonaState = 'invisible';
  private isGameDetailsPrivate: boolean | null = null;
  private pendingPrivacyPromise: Promise<boolean> | null = null;
  private pendingPrivacyTarget: boolean | null = null;
  private lastPrivacyRequestTime = 0;
  private gameCardsMetaCache = new Map<number, Array<{ cardName: string; cardImage: string }>>();
  private inventoryCache = new Map<string, { timestamp: number; cards: Array<any> }>();
  private inFlightInventoryRequests = new Map<string, Promise<Array<any>>>();
  private lastInventoryRequestTime = new Map<string, number>();

  constructor(initialPersonaState: PersonaState = 'invisible') {
    super();
    this.preferredPersonaState = initialPersonaState;
    this.user = new SteamUser({
      autoRelogin: true,
      enablePicsCache: true,
    });
    this.community = new SteamCommunity();

    this.setupListeners();
  }

  private setupListeners(): void {
    this.user.on('loggedOn', () => {
      this.isCmConnected = true;
      this.isConnected = true;
      const steamID64 = this.user.steamID?.getSteamID64() || '';
      this.currentAccountId = steamID64;
      console.log(`[SteamClient] Logged on to Steam Connection Manager as ${steamID64}`);
      this.applyPersonaState(this.preferredPersonaState);

      // Request web session to negotiate steamcommunity.com cookies
      try {
        this.user.webLogOn();
      } catch (e: any) {
        console.warn('Steam webLogOn error:', e?.message || e);
      }

      // If active games were already requested before logon, send them now!
      if (this.currentActiveGames.length > 0) {
        try {
          this.user.gamesPlayed(this.currentActiveGames, true);
          this.emit('playingGamesChanged', this.currentActiveGames);
        } catch (e: any) {
          console.warn('Failed to start gamesPlayed on loggedOn:', e?.message || e);
        }
      }

      if (this.user.country) {
        const curr = getCurrencyFromCountry(this.user.country);
        console.log(`[SteamClient] Detected store currency without wallet: ${curr.country} -> ${curr.currencyCode} (${curr.currencySymbol})`);
        this.emit('currencyDetected', curr);
      }

      this.emit('loggedOn', steamID64);
    });

    this.user.on('accountInfo', (name: string, country: string) => {
      const targetCountry = country || this.user.country;
      const curr = getCurrencyFromCountry(targetCountry);
      console.log(`[SteamClient] Account info received: country=${targetCountry} -> Currency: ${curr.currencyCode} (${curr.currencySymbol}) [Wallet-free]`);
      this.emit('currencyDetected', curr);
    });

    this.user.on('webSession', (sessionID: any, cookies: any) => {
      try {
        if (Array.isArray(cookies)) {
          if (!cookies.some((c: string) => c.startsWith('Steam_Language='))) {
            cookies.push('Steam_Language=english');
          }
          this.community.setCookies(cookies);
          this.communityCookiesSet = true;

          // Çerezler üzerinden de ülke/para birimi tespiti (Cüzdana bakmadan)
          const countryCookie = cookies.find((c: string) => c.startsWith('steamCountry='));
          if (countryCookie) {
            const rawCountry = countryCookie.split('=')[1]?.split('%')[0]?.split('&')[0];
            if (rawCountry && rawCountry.length === 2) {
              const curr = getCurrencyFromCountry(rawCountry);
              this.emit('currencyDetected', curr);
            }
          }

          // Eğer çerezler henüz hazır değilken beklemeye alınan bir gizlilik ayarı varsa güvenle uygula
          if (this.pendingPrivacyTarget !== null) {
            const target = this.pendingPrivacyTarget;
            this.pendingPrivacyTarget = null;
            setTimeout(() => {
              this.setGameDetailsPrivate(target).catch(() => {});
            }, 1500);
          }
        }
      } catch (e: any) {
        console.warn('Failed to set community cookies on webSession:', e?.message || e);
      }
      this.emit('webSession', { sessionID, cookies });
    });

    this.user.on('newItems', (count: number) => {
      console.log(`[SteamClient] Steam new inventory items notification received: ${count}`);
      this.emit('newItems', count);
    });

    this.user.on('receivedNewItems', () => {
      console.log('[SteamClient] Steam received new items notification');
      this.emit('newItems', 1);
    });

    this.user.on('error', (err: any) => {
      this.isCmConnected = false;
      this.isConnected = false;
      const isSessionReplaced = err?.message?.includes('LogonSessionReplaced') || err?.eresult === 34;
      if (isSessionReplaced) {
        console.warn('[SteamClient] Steam oturumu başka bir cihaz/istemci tarafından devralındı (LogonSessionReplaced).');
      } else {
        console.warn('[SteamClient] Steam connection error:', err?.message || err);
      }
      if (this.listenerCount('error') > 0) {
        this.emit('error', err);
      }
      this.emit('clientError', err);
    });

    this.user.on('disconnected', (eresult: any, msg: any) => {
      this.isCmConnected = false;
      this.isConnected = false;
      const isSessionReplaced = eresult === 34 || msg?.includes?.('LogonSessionReplaced');
      if (isSessionReplaced) {
        console.warn('[SteamClient] Steam oturumu başka bir istemcide açıldığı için bağlantı kesildi (LogonSessionReplaced).');
      } else {
        console.warn('[SteamClient] Steam disconnected:', msg);
      }
      this.emit('disconnected', { eresult, msg, isSessionReplaced });
    });
  }

  public setPersonaState(state: PersonaState): void {
    this.preferredPersonaState = state;
    this.applyPersonaState(state);
  }

  public getPersonaState(): PersonaState {
    return this.preferredPersonaState;
  }

  /**
   * Steam Topluluk profilindeki Oyun Detayları (Game Details) gizlilik ayarını günceller.
   * isPrivate=true olduğunda arkadaşlar listenizde Çevrimiçi görünürsünüz ancak oyun bildirimleri gitmez.
   */
  public async setGameDetailsPrivate(isPrivate: boolean): Promise<boolean> {
    // 1. Zaten istenen gizlilik durumundaysa tekrar Steam'e istek atıp 429 tetikleme!
    if (this.isGameDetailsPrivate === isPrivate) {
      return true;
    }

    // 2. Halihazırda devam eden bir istek varsa onu bekle (Deduplication)
    if (this.pendingPrivacyPromise) {
      return this.pendingPrivacyPromise;
    }

    // 3. Topluluk çerezleri henüz oturum açmamışsa isteği sıraya al, webSession geldiğinde uygula
    if (!this.community || !this.communityCookiesSet) {
      console.log(
        `[SteamClient] Topluluk çerezleri bekleniyor, Oyun Detayları gizliliği (${isPrivate ? 'Gizli' : 'Herkese Açık'}) sıraya alındı.`
      );
      this.pendingPrivacyTarget = isPrivate;
      return false;
    }

    // 4. Rate-limit koruması: İstekler arasında en az 8 saniye bekle
    const now = Date.now();
    if (now - this.lastPrivacyRequestTime < 8000) {
      console.log('[SteamClient] Profil gizlilik isteği Steam hız sınırı nedeniyle ertelendi.');
      this.pendingPrivacyTarget = isPrivate;
      return false;
    }

    this.lastPrivacyRequestTime = now;

    this.pendingPrivacyPromise = new Promise((resolve) => {
      try {
        const privacyVal = isPrivate ? 1 : 3;
        this.community.profileSettings({ gameDetails: privacyVal, playtime: privacyVal }, (err: any) => {
          this.pendingPrivacyPromise = null;
          if (err) {
            const errMsg = err?.message || String(err);
            if (errMsg.includes('429')) {
              console.warn('[SteamClient] Steam Topluluk istek limiti (HTTP 429). Profil ayarı arka planda gecikmeli yansıtılacak.');
              setTimeout(() => {
                if (this.preferredPersonaState === 'silent_online' && this.isGameDetailsPrivate !== true) {
                  this.setGameDetailsPrivate(true).catch(() => {});
                }
              }, 25000);
            } else {
              console.warn('[SteamClient] profileSettings error:', errMsg);
            }
            return resolve(false);
          }

          this.isGameDetailsPrivate = isPrivate;
          console.log(
            `[SteamClient] Steam Game Details privacy successfully set to ${isPrivate ? 'Private (1)' : 'Public (3)'}`
          );
          resolve(true);
        });
      } catch (e: any) {
        this.pendingPrivacyPromise = null;
        console.warn('[SteamClient] setGameDetailsPrivate exception:', e?.message || e);
        resolve(false);
      }
    });

    return this.pendingPrivacyPromise;
  }

  private applyPersonaState(state: PersonaState): void {
    try {
      if (!this.user || !this.user.steamID) {
        console.log(`[SteamClient] Persona state "${state}" saved, awaiting Steam connection.`);
        return;
      }

      let enumVal = SteamUser.EPersonaState.Online;
      if (state === 'invisible') {
        enumVal = SteamUser.EPersonaState.Invisible;
      } else if (state === 'offline') {
        enumVal = SteamUser.EPersonaState.Offline;
      } else if (state === 'silent_online') {
        enumVal = SteamUser.EPersonaState.Online;
        // Sessiz Çevrimiçi Modu: Steam'de Online görünür, oyun detayları gizli yapılarak bildirimler engellenir
        if (this.isGameDetailsPrivate !== true) {
          this.setGameDetailsPrivate(true).catch((err) =>
            console.warn('[SteamClient] silent_online privacy error:', err?.message || err)
          );
        }
      } else if (state === 'online') {
        enumVal = SteamUser.EPersonaState.Online;
        // Kullanıcı sessiz moddan normal online moda döndüyse oyun detaylarını tekrar herkese aç
        if (this.isGameDetailsPrivate === true) {
          this.setGameDetailsPrivate(false).catch((err) =>
            console.warn('[SteamClient] restore privacy error:', err?.message || err)
          );
        }
      } else {
        enumVal = SteamUser.EPersonaState.Online;
      }

      console.log(`[SteamClient] Applying persona state to Steam CM: ${state} (enum ${enumVal})`);
      this.user.setPersona(enumVal);

      // If online and games are active, re-announce gamesPlayed to ensure friends list reflects in-game presence immediately
      if (enumVal === SteamUser.EPersonaState.Online && this.currentActiveGames.length > 0) {
        try {
          this.user.gamesPlayed(this.currentActiveGames, true);
        } catch (err: any) {
          console.warn('[SteamClient] Failed to re-announce gamesPlayed on persona change:', err?.message || err);
        }
      }
    } catch (e: any) {
      console.warn('[SteamClient] Failed to set persona state:', e?.message || e);
    }
  }

  public async startQRLogin(): Promise<{ challengeUrl: string; qrCodeDataUrl: string }> {
    const { LoginSession, EAuthTokenPlatformType } = require('steam-session');
    const machineName = os.hostname() || 'MegaIdlePlus-PC';
    const session = new LoginSession(EAuthTokenPlatformType.SteamClient, {
      machineFriendlyName: machineName,
    });
    const startResult = await session.startWithQR();

    const qrUrl = startResult.qrChallengeUrl || (session as any)._startSessionResponse?.challengeUrl;
    if (!qrUrl) {
      throw new Error('Steam QR oturum adresi alınamadı.');
    }

    const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, {
      margin: 2,
      width: 280,
      color: {
        dark: '#00f2fe',
        light: '#0b0e14',
      },
    });

    session.on('authenticated', async () => {
      const steamID64 = session.steamID?.getSteamID64
        ? session.steamID.getSteamID64()
        : String(session.steamID || '');
      this.currentAccountId = steamID64;

      if (!this.isConnected && !this.user?.steamID && !this.user?._connecting && !this.user?._loggingOn) {
        try {
          const p = this.user.logOn({
            refreshToken: session.refreshToken,
          });
          if (p && typeof p.catch === 'function') {
            p.catch((err: any) => {
              console.warn('[SteamClient] QR logOn rejected:', err?.message || err);
            });
          }
        } catch (e: any) {
          console.warn('[SteamClient] QR logOn error:', e?.message || e);
        }
      }

      this.emit('qrAuthenticated', {
        steamID: steamID64,
        accountName: session.accountName,
        refreshToken: session.refreshToken,
      });
    });

    session.on('timeout', () => {
      this.emit('qrTimeout');
    });

    session.on('error', (err: any) => {
      this.emit('qrError', err);
    });

    return {
      challengeUrl: qrUrl,
      qrCodeDataUrl,
    };
  }

  public async ensureCommunitySession(targetAccountId?: string, refreshToken?: string): Promise<boolean> {
    // 1. Çerez formatı kontrolü: Eğer refreshToken "sessionId|steamLoginSecure" formatındaysa, doğrudan çerezleri yükle!
    if (refreshToken && refreshToken.includes('|')) {
      const parts = refreshToken.split('|');
      if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
        try {
          this.community.setCookies([
            `sessionid=${parts[0].trim()}`,
            `steamLoginSecure=${parts[1].trim()}`,
            'Steam_Language=english',
          ]);
          this.communityCookiesSet = true;
          if (targetAccountId) this.currentAccountId = targetAccountId;

          if (this.pendingPrivacyTarget !== null) {
            const target = this.pendingPrivacyTarget;
            this.pendingPrivacyTarget = null;
            setTimeout(() => {
              this.setGameDetailsPrivate(target).catch(() => {});
            }, 1000);
          }

          return true;
        } catch (e: any) {
          console.warn('ensureCommunitySession: Çerezler yüklenirken hata:', e?.message || e);
        }
      }
    }

    if (this.communityCookiesSet && (!targetAccountId || this.currentAccountId === targetAccountId)) {
      return true;
    }

    // Connect via CM if not connected and we have a valid JWT refresh token (contains dots, not pipe)
    if (!this.isConnected) {
      if (refreshToken && !refreshToken.includes('|') && refreshToken.includes('.')) {
        this.logOnWithToken(refreshToken);
        const connected = await this.waitForConnection(8000);
        if (!connected) {
          console.warn('ensureCommunitySession: Steam CM ağına bağlanılamadı.');
          return false;
        }
      } else {
        return false;
      }
    }

    if (this.communityCookiesSet) {
      return true;
    }

    // Wait for webSession negotiated over authenticated CM socket
    return new Promise<boolean>((resolve) => {
      if (this.communityCookiesSet) {
        return resolve(true);
      }

      const timer = setTimeout(() => {
        resolve(this.communityCookiesSet);
      }, 8000);

      const onWebSession = () => {
        clearTimeout(timer);
        resolve(true);
      };

      this.once('webSession', onWebSession);

      try {
        this.user.webLogOn();
      } catch (err: any) {
        console.warn('webLogOn error:', err?.message || err);
      }
    });
  }

  public async waitForConnection(timeoutMs = 8000): Promise<boolean> {
    if (this.isCmConnected && !!this.user?.steamID) return true;

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        resolve(this.isCmConnected && !!this.user?.steamID);
      }, timeoutMs);

      const onLogon = () => {
        clearTimeout(timer);
        this.removeListener('error', onError);
        resolve(true);
      };

      const onError = () => {
        clearTimeout(timer);
        this.removeListener('loggedOn', onLogon);
        resolve(false);
      };

      this.once('loggedOn', onLogon);
      this.once('error', onError);
    });
  }

  public logOnWithToken(refreshToken: string): void {
    if (this.isCmConnected && this.user?.steamID) {
      this.applyPersonaState(this.preferredPersonaState);
      return;
    }

    // Cookie formatındaki tokenları veya geçersiz tokenları asla steam-user CM logOn'a gönderme
    if (!refreshToken || refreshToken.includes('|') || !refreshToken.includes('.')) {
      console.warn('[SteamClient] Geçersiz veya çerez biçiminde refresh token, CM bağlantısı denenmedi.');
      return;
    }

    try {
      console.log('[SteamClient] Connecting to Steam CM using refresh token...');
      const p = this.user.logOn({
        refreshToken,
      });
      if (p && typeof p.catch === 'function') {
        p.catch((err: any) => {
          console.warn('[SteamClient] logOn rejected:', err?.message || err);
        });
      }
    } catch (e: any) {
      if (!e?.message?.includes('Already')) {
        console.warn('logOnWithToken exception:', e?.message || e);
      }
    }
  }

  public logOnWithCredentials(accountName: string, password: string, twoFactorCode?: string): void {
    try {
      const p = this.user.logOn({
        accountName,
        password,
        twoFactorCode,
      });
      if (p && typeof p.catch === 'function') {
        p.catch((err: any) => {
          console.warn('[SteamClient] logOn credentials rejected:', err?.message || err);
        });
      }
    } catch (e: any) {
      console.warn('[SteamClient] logOn credentials error:', e?.message || e);
    }
  }

  public async validateAndLogOnWithCookies(
    sessionID: string,
    steamLoginSecure: string
  ): Promise<{
    success: boolean;
    error?: string;
    errorEn?: string;
    steamID?: string;
    accountName?: string;
    avatarUrl?: string;
  }> {
    const cleanSessionID = sessionID ? sessionID.trim() : '';
    const cleanLoginSecure = steamLoginSecure ? steamLoginSecure.trim() : '';

    if (!cleanSessionID || !cleanLoginSecure) {
      return {
        success: false,
        error: 'Lütfen hem sessionid hem de steamLoginSecure çerez değerlerini girin.',
        errorEn: 'Please enter both sessionid and steamLoginSecure cookie values.',
      };
    }

    // 1. Biçim kontrolü: steamLoginSecure içinde 17 haneli geçerli SteamID64 bulunmalıdır
    const decodedLogin = decodeURIComponent(cleanLoginSecure);
    const steamIDMatch = decodedLogin.match(/(7656119\d{10})/);

    if (!steamIDMatch) {
      return {
        success: false,
        error:
          'Geçersiz steamLoginSecure değeri! Çerez "7656119...||..." formatında 17 haneli geçerli bir SteamID64 içermelidir. Rastgele veriler kabul edilmez.',
        errorEn:
          'Invalid steamLoginSecure value! Cookie must contain a valid 17-digit SteamID64 in "7656119...||..." format. Random data is not accepted.',
      };
    }

    const steamID64 = steamIDMatch[1];

    // 2. Çerezleri SteamCommunity istemcisine yükle
    const cookies = [
      `sessionid=${cleanSessionID}`,
      `steamLoginSecure=${cleanLoginSecure}`,
      'Steam_Language=english',
    ];

    try {
      this.community.setCookies(cookies);
    } catch (e: any) {
      return {
        success: false,
        error: `Çerezler yüklenemedi: ${e.message || e}`,
        errorEn: `Failed to load cookies: ${e.message || e}`,
      };
    }

    // 3. Steam sunucusu üzerinden canlı oturum kontrolü (https://steamcommunity.com/my)
    const loginCheck = await new Promise<{ ok: boolean; error?: string; errorEn?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          ok: false,
          error: 'Steam sunucusuna bağlanırken zaman aşımı oluştu. Lütfen internet bağlantınızı kontrol edin.',
          errorEn: 'Connection to Steam servers timed out. Please check your internet connection.',
        });
      }, 12000);

      this.community.loggedIn((err: any, loggedIn: boolean) => {
        clearTimeout(timeout);
        if (err) {
          resolve({
            ok: false,
            error: `Steam oturum kontrol hatası: ${err.message || 'Sunucu yanıt vermedi'}`,
            errorEn: `Steam session check error: ${err.message || 'Server did not respond'}`,
          });
        } else if (!loggedIn) {
          resolve({
            ok: false,
            error:
              'Steam oturumu doğrulanamadı! Girdiğiniz çerezlerin süresi dolmuş veya geçersiz. Lütfen tarayıcınızdan güncel çerezleri kopyalayın.',
            errorEn:
              'Steam session could not be verified! The cookies you entered are expired or invalid. Please copy fresh cookies from your browser.',
          });
        } else {
          resolve({ ok: true });
        }
      });
    });

    if (!loginCheck.ok) {
      return {
        success: false,
        error: loginCheck.error,
        errorEn: loginCheck.errorEn,
      };
    }

    // 4. Doğrulama başarılı! Steam profilinden gerçek kullanıcı adını ve profil avatarını çek
    let realName: string | undefined;
    let realAvatar: string | undefined;

    try {
      const SteamID = require('steamid');
      const sid = new SteamID(steamID64);
      const userProfile = await new Promise<any>((resolve) => {
        this.community.getSteamUser(sid, (err: any, user: any) => {
          if (err || !user) resolve(null);
          else resolve(user);
        });
      });

      if (userProfile) {
        realName = userProfile.name;
        if (userProfile.avatarHash) {
          realAvatar = `https://avatars.steamstatic.com/${userProfile.avatarHash}_full.jpg`;
        }
      }
    } catch (e) {
      console.warn('Steam user details parse warning:', e);
    }

    this.communityCookiesSet = true;
    this.isConnected = true;
    this.currentAccountId = steamID64;
    this.emit('cookieLoggedIn');

    return {
      success: true,
      steamID: steamID64,
      accountName: realName,
      avatarUrl: realAvatar,
    };
  }

  public logOnWithCookies(sessionID: string, steamLoginSecure: string): void {
    const cookies = [
      `sessionid=${sessionID}`,
      `steamLoginSecure=${steamLoginSecure}`,
      'Steam_Language=english',
    ];
    this.community.setCookies(cookies);
    this.communityCookiesSet = true;
    this.isConnected = true;
    this.emit('cookieLoggedIn');
  }

  public playGames(appIds: number[]): void {
    this.currentActiveGames = appIds;
    if (this.isConnected) {
      try {
        console.log(
          `[SteamClient] playGames invoked with ${appIds.length} appIDs (isCmConnected: ${this.isCmConnected}):`,
          appIds.slice(0, 8),
          appIds.length > 8 ? `(+${appIds.length - 8} more)` : ''
        );
        this.user.gamesPlayed(appIds, true);
        this.emit('playingGamesChanged', appIds);
      } catch (err) {
        console.error('Error in gamesPlayed:', err);
      }
    } else {
      console.log('playGames queued, awaiting connection:', appIds);
    }
  }

  public stopPlaying(): void {
    this.currentActiveGames = [];
    if (this.isConnected) {
      try {
        this.user.gamesPlayed([]);
        this.emit('playingGamesChanged', []);
      } catch (err) {
        console.error('Error stopping gamesPlayed:', err);
      }
    }
  }

  /**
   * Fetches user badges from Steam Community to detect remaining card drops.
   */
  public async fetchBadgesData(steamId64?: string, refreshToken?: string): Promise<GameQueueItem[]> {
    const targetId = steamId64 || this.currentAccountId;
    if (!targetId) {
      console.warn('fetchBadgesData: Steam ID bulunamadı.');
      return [];
    }

    if (refreshToken) {
      await this.ensureCommunitySession(targetId, refreshToken);
    }

    const Cheerio = require('cheerio');
    const items: GameQueueItem[] = [];

    let page = 1;
    let hasMorePages = true;

    while (hasMorePages && page <= 15) {
      // Eğer topluluk çerezlerimiz ayarlanmışsa kendi rozet sayfamızı (/my/badges/) doğrudan oku; bu sayede profil gizliliğine takılmaz!
      const primaryUrl = this.communityCookiesSet
        ? `https://steamcommunity.com/my/badges/?p=${page}`
        : `https://steamcommunity.com/profiles/${targetId}/badges/?p=${page}`;

      const pageResult = await new Promise<{ html: string; statusCode: number; error?: any }>((resolve) => {
        this.community.httpRequestGet(
          {
            uri: primaryUrl,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          },
          (err: any, res: any, body: string) => {
            if (err) {
              resolve({ html: body || '', statusCode: res?.statusCode || 500, error: err });
            } else {
              resolve({ html: body || '', statusCode: res?.statusCode || 200 });
            }
          }
        );
      });

      let html = pageResult.html;

      // Fallback: Eğer ilk URL başarısız olduysa veya profil gizli geldiyse alternatif URL'yi dene
      if (pageResult.error || !html || html.includes('id="loginForm"') || html.includes('profile_private_info')) {
        const fallbackUrl = this.communityCookiesSet
          ? `https://steamcommunity.com/profiles/${targetId}/badges/?p=${page}`
          : `https://steamcommunity.com/my/badges/?p=${page}`;

        const fallbackResult = await new Promise<{ html: string; statusCode: number }>((resolve) => {
          this.community.httpRequestGet(
            {
              uri: fallbackUrl,
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
              },
            },
            (err: any, res: any, body: string) => {
              resolve({ html: body || '', statusCode: res?.statusCode || 200 });
            }
          );
        });

        if (fallbackResult.html && !fallbackResult.html.includes('id="loginForm"')) {
          html = fallbackResult.html;
        }
      }

      if (!html || html.length < 200) {
        console.warn(`Rozet sayfası ${page} boş veya erişilemiyor.`);
        break;
      }

      const $ = Cheerio.load(html);
      const rows = $('.badge_row');

      if (rows.length === 0) {
        break;
      }

      let foundOnThisPage = 0;

      rows.each((_: number, el: any) => {
        const row = $(el);
        const cardLink =
          row.find('a[href*="/gamecards/"]').attr('href') ||
          row.find('a.badge_row_overlay').attr('href') ||
          '';
        const appIdMatch = cardLink.match(/\/gamecards\/(\d+)/);

        if (!appIdMatch) return;
        const appId = parseInt(appIdMatch[1]);

        const progressBold =
          row.find('.progress_info_bold').text().trim() ||
          row.find('.badge_progress_info').text().trim();

        const lowerText = progressBold.toLowerCase();
        const isNoDrops =
          lowerText.includes('no card drop') ||
          lowerText.includes('no card') ||
          lowerText.includes('kart hakkınız kalmadı') ||
          lowerText.includes('kart hakkı kalmadı') ||
          lowerText.includes('hakkınız kalmadı');

        const dropMatch =
          progressBold.match(/(\d+)\s*(?:card drop|kart hakk)/i) ||
          (!isNoDrops && (lowerText.includes('remaining') || lowerText.includes('kaldı'))
            ? progressBold.match(/(\d+)/)
            : null);

        if (dropMatch) {
          const cardsRemaining = parseInt(dropMatch[1]);

          if (cardsRemaining > 0 && !isNoDrops) {
            let title = row.find('.badge_title').clone().children().remove().end().text().trim();
            if (!title) {
              title = row.find('.badge_title').text().trim().split('\n')[0].trim();
            }

            const statsText =
              row.find('.badge_title_stats_playtime').text() ||
              row.find('.badge_title_stats').text() ||
              row.text();
            const playMatch = statsText.match(/([0-9.,]+)\s*(?:hrs|hours|saat|hr)/i);
            let playtimeMinutes = 0;
            if (playMatch) {
              const hours = parseFloat(playMatch[1].replace(',', '.')) || 0;
              playtimeMinutes = Math.round(hours * 60);
            }

            items.push({
              accountId: targetId,
              appId,
              gameTitle: title || `App ${appId}`,
              headerImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
              cardsRemaining,
              playtimeMinutes,
              isVac: false,
              isBlacklisted: false,
              sortOrder: 0,
              status: 'pending',
            });
            foundOnThisPage++;
          }
        }
      });

      console.log(`[Rozet Tarama] Sayfa ${page}: ${rows.length} rozet incelendi, ${foundOnThisPage} adet kart hakkı olan oyun bulundu.`);

      if (!html.includes(`?p=${page + 1}`) && !html.includes(`&amp;p=${page + 1}`)) {
        hasMorePages = false;
      } else {
        page++;
      }
    }

    return items;
  }

  /**
   * Fetches user's Steam Trading Cards (AppID 753, Context 6) directly from their inventory.
   * Returns list of real cards with real name, real card artwork, game appId, and game title.
   */
  public async fetchCardInventory(
    steamId64?: string,
    refreshToken?: string,
    forceFresh = false
  ): Promise<
    Array<{
      assetId: string;
      appId: number;
      gameTitle: string;
      cardName: string;
      marketHashName: string;
      cardImage: string;
    }>
  > {
    const targetId = steamId64 || this.currentAccountId || (this.user?.steamID ? this.user.steamID.getSteamID64() : null);
    if (!targetId) {
      console.warn('fetchCardInventory: Steam ID bulunamadı.');
      return [];
    }

    const now = Date.now();
    const cached = this.inventoryCache.get(targetId);

    // 1. Önbellek Koruması: forceFresh değilse ve önbellek geçerliyse (30 saniye TTL) doğrudan önbellekten dön
    const INVENTORY_CACHE_TTL_MS = 30_000;
    if (!forceFresh && cached && (now - cached.timestamp < INVENTORY_CACHE_TTL_MS)) {
      return cached.cards;
    }

    // 2. In-Flight İstek Birleştirme: Aynı SteamID için zaten çalışan bir istek varsa mükerrer istek açma
    const existingPromise = this.inFlightInventoryRequests.get(targetId);
    if (existingPromise) {
      return existingPromise;
    }

    // 3. Rate Limit & Duplicate Request Koruması: Son istekten sonra en az 3.5 saniye bekle
    const lastRequest = this.lastInventoryRequestTime.get(targetId) || 0;
    const timeSinceLast = now - lastRequest;
    if (timeSinceLast < 3_500 && !forceFresh) {
      if (cached) {
        return cached.cards;
      }
      await new Promise((r) => setTimeout(r, 3_500 - timeSinceLast));
    }

    const requestPromise = (async () => {
      this.lastInventoryRequestTime.set(targetId, Date.now());

      if (refreshToken) {
        await this.ensureCommunitySession(targetId, refreshToken);
      }

      return new Promise<Array<any>>((resolve) => {
        this.community.getUserInventoryContents(targetId, 753, 6, false, 'turkish', (err: any, inventory: any[]) => {
          if (err || !inventory) {
            const errMsg = err?.message || String(err || '');
            if (errMsg.toLowerCase().includes('private')) {
              console.log('[SteamClient] Profil/envanter gizli (Private Profile). Kart detayları Steam Pazarı ve Rozet meta verisinden otomatik sağlanacak.');
              return resolve([]);
            }
            if (errMsg.toLowerCase().includes('duplicate') || errMsg.includes('429')) {
              console.warn('[SteamClient] Steam envanter hız limiti / mükerrer istek uyarısı, önbelleğe dönülüyor:', errMsg);
              if (cached) {
                return resolve(cached.cards);
              }
            } else {
              console.warn('getUserInventoryContents warning:', errMsg);
            }
            return resolve(cached ? cached.cards : []);
          }

        const cards = inventory.filter((item: any) => {
          const typeStr = (item.type || '').toLowerCase();
          const nameStr = (item.name || item.market_name || '').toLowerCase();
          const tags = (item.tags || []) as any[];

          // 1. KESİN ELEME (KARA LİSTE): Çıkartmalar, ifadeler, arka planlar vb. asla kart değildir
          const isBlacklisted =
            typeStr.includes('çıkartma') ||
            typeStr.includes('sticker') ||
            typeStr.includes('ifade') ||
            typeStr.includes('emoticon') ||
            typeStr.includes('arka plan') ||
            typeStr.includes('background') ||
            typeStr.includes('cevher') ||
            typeStr.includes('gem') ||
            typeStr.includes('hızlandırma paketi') ||
            typeStr.includes('booster') ||
            typeStr.includes('sohbet efekti') ||
            typeStr.includes('chat effect') ||
            typeStr.includes('avatar') ||
            typeStr.includes('çerçeve') ||
            typeStr.includes('frame') ||
            nameStr.includes('çıkartma') ||
            nameStr.includes('sticker') ||
            tags.some((t: any) => {
              const cat = (t.category || '').toLowerCase();
              const tagInternal = (t.internal_name || '').toLowerCase();
              const tagLocal = (t.localized_tag_name || '').toLowerCase();
              return (
                cat === 'item_class' &&
                (tagInternal.includes('sticker') ||
                  tagInternal.includes('emoticon') ||
                  tagInternal.includes('profilebackground') ||
                  tagInternal.includes('booster'))
              ) ||
              tagLocal.includes('çıkartma') ||
              tagLocal.includes('sticker') ||
              tagLocal.includes('ifade') ||
              tagLocal.includes('emoticon') ||
              tagLocal.includes('arka plan') ||
              tagLocal.includes('hızlandırma');
            });

          if (isBlacklisted) return false;

          // 2. GERÇEK KOLEKSİYON KARTI (TRADING CARD) TEYİDİ
          const hasCardTag = tags.some((t: any) => {
            const cat = (t.category || '').toLowerCase();
            const tagInternal = (t.internal_name || '').toLowerCase();
            const tagLocal = (t.localized_tag_name || '').toLowerCase();
            const tagName = (t.name || '').toLowerCase();

            return (
              (cat === 'item_class' && (tagInternal === 'item_class_2' || tagInternal === 'item_class_5')) ||
              tagLocal === 'koleksiyon kartı' ||
              tagLocal === 'parlak koleksiyon kartı' ||
              tagLocal === 'trading card' ||
              tagLocal === 'foil trading card' ||
              tagName === 'trading card' ||
              tagName === 'foil trading card' ||
              tagLocal.includes('koleksiyon kartı') ||
              tagLocal.includes('trading card')
            );
          });

          const hasCardType =
            typeStr.includes('koleksiyon kartı') ||
            typeStr.includes('trading card') ||
            typeStr.includes('foil trading card') ||
            typeStr.includes('parlak koleksiyon kartı');

          return hasCardTag || hasCardType;
        });

        const parsed = cards.map((c: any) => {
          let appId = c.market_fee_app ? parseInt(c.market_fee_app) : 0;
          if (!appId && c.tags && Array.isArray(c.tags)) {
            const appTag = c.tags.find((t: any) => t.category === 'Game' && t.internal_name?.startsWith('app_'));
            if (appTag) {
              appId = parseInt(appTag.internal_name.replace('app_', ''));
            }
          }

          let gameTitle = '';
          if (c.tags && Array.isArray(c.tags)) {
            const gameTag = c.tags.find((t: any) => t.category === 'Game');
            if (gameTag) gameTitle = gameTag.localized_tag_name || gameTag.name || '';
          }
          if (!gameTitle && c.type) {
            gameTitle = c.type.replace(/\s*(Trading Card|Koleksiyon Kartı|Foil Trading Card).*/i, '').trim();
          }

          // Steam Trading Card'larda icon_url_large gerçek karakter/kart görselidir (örn: Launch çizimi).
          const imageHash = c.icon_url_large || c.icon_url;
          let cardImage = '';
          if (imageHash) {
            cardImage = imageHash.startsWith('http')
              ? imageHash
              : `https://community.cloudflare.steamstatic.com/economy/image/${imageHash}/360fx360f`;
          } else if (typeof c.getLargeImageURL === 'function') {
            cardImage = c.getLargeImageURL();
          } else if (typeof c.getImageURL === 'function') {
            cardImage = c.getImageURL();
          } else if (appId) {
            cardImage = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
          }

          // Kart ismi: Gerçek kart adı temiz bir şekilde alınır (Örn: "LIU KANG", "Youngster", "Launch")
          const rawName = c.name || c.market_name || '';
          let cardName = cleanCardName(rawName, gameTitle);
          if (!cardName) {
            cardName = 'Koleksiyon Kartı';
          }

          return {
            assetId: c.assetid || c.id || '',
            appId: appId || 0,
            gameTitle: gameTitle || 'Steam Oyunu',
            cardName,
            marketHashName: c.market_hash_name || c.market_name || c.name || `${appId}-Trading Card`,
            cardImage,
          };
        });

        this.inventoryCache.set(targetId, { timestamp: Date.now(), cards: parsed });
        resolve(parsed);
      });
    });
    })();

    this.inFlightInventoryRequests.set(targetId, requestPromise);
    try {
      return await requestPromise;
    } finally {
      this.inFlightInventoryRequests.delete(targetId);
    }
  }

  /**
   * Checks the exact card drop status for a single game directly from its gamecards page.
   * Resolves whether cards remain and the exact count, without 2-hour restrictions.
   */
  public async checkSingleGameCardDrops(
    appId: number,
    targetId?: string
  ): Promise<{ status: 'confirmed' | 'unconfirmed' | 'error'; cardsRemaining: number; hasCards: boolean }> {
    const steamId =
      targetId ||
      this.currentAccountId ||
      (this.user?.steamID ? this.user.steamID.getSteamID64() : null);
    if (!steamId) return { status: 'error', cardsRemaining: -1, hasCards: true };

    const Cheerio = require('cheerio');
    const url = `https://steamcommunity.com/profiles/${steamId}/gamecards/${appId}/`;

    return new Promise((resolve) => {
      this.community.httpRequestGet(
        {
          uri: url,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        },
        (err: any, _res: any, body: string) => {
          if (err || !body) {
            return resolve({ status: 'error', cardsRemaining: -1, hasCards: true });
          }

          // Sayfa içeriğinde hata, gizli profil veya login yönlendirmesi var mı kontrol et
          const lowerBody = body.toLowerCase();
          if (
            lowerBody.includes('this profile is private') ||
            lowerBody.includes('bu profil gizlidir') ||
            lowerBody.includes('login_overlay') ||
            lowerBody.includes('giriş yap')
          ) {
            return resolve({ status: 'unconfirmed', cardsRemaining: -1, hasCards: true });
          }

          const $ = Cheerio.load(body);
          const progressBold =
            $('.progress_info_bold').text().trim() ||
            $('.badge_progress_info').text().trim();
          const lowerText = progressBold.toLowerCase();

          // 1. Kalan kart sayısı varsa: örn "5 card drops remaining" veya "2 kart hakkınız kaldı"
          const match = progressBold.match(/(\d+)\s*(?:card drop|kart hakk|kart düşürme)/i);
          if (match) {
            const count = parseInt(match[1]);
            return resolve({ status: 'confirmed', cardsRemaining: count, hasCards: count > 0 });
          }

          // 2. Kart hakkı bittiği açıkça belirtilmiş mi?
          if (
            lowerText.includes('no card') ||
            lowerText.includes('kalmadı') ||
            lowerText.includes('0 card') ||
            lowerText.includes('0 kart') ||
            lowerBody.includes('no card drops remaining') ||
            lowerBody.includes('kart hakkınız kalmadı')
          ) {
            return resolve({ status: 'confirmed', cardsRemaining: 0, hasCards: false });
          }

          return resolve({ status: 'unconfirmed', cardsRemaining: -1, hasCards: true });
        }
      );
    });
  }

  /**
   * Bir oyunun Steam rozet sayfasından veya herkese açık Steam Pazarı'ndan kart adlarını ve görsellerini çeker.
   * Profil tamamen Gizli (Private) olsa bile Steam Pazarı üzerinden gerçek kart adlarını (örn: "Launch") %100 doğrulukla bulur.
   */
  public async fetchGameCardsMetadata(
    appId: number,
    targetId?: string
  ): Promise<Array<{ cardName: string; cardImage: string }>> {
    if (!appId) return [];

    if (this.gameCardsMetaCache.has(appId)) {
      const cached = this.gameCardsMetaCache.get(appId)!;
      if (cached && cached.length > 0) return cached;
    }

    const steamId =
      targetId ||
      this.currentAccountId ||
      (this.user?.steamID ? this.user.steamID.getSteamID64() : null);

    const Cheerio = require('cheerio');
    const cards: Array<{ cardName: string; cardImage: string }> = [];

    // 1. Yol: Steam Rozet / Gamecards Sayfasını dene (kendi oturumu ve profiles URL)
    if (steamId) {
      const candidateUrls = [
        `https://steamcommunity.com/my/gamecards/${appId}/?l=turkish`,
        `https://steamcommunity.com/profiles/${steamId}/gamecards/${appId}/?l=turkish`,
      ];

      for (const url of candidateUrls) {
        try {
          const body: string = await new Promise((resolve, reject) => {
            this.community.httpRequestGet(
              {
                uri: url,
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept-Language': 'tr-TR,tr;q=0.9,en-US,en;q=0.8',
                },
              },
              (err: any, _res: any, resBody: string) => {
                if (err || !resBody) return reject(err || new Error('Empty body'));
                resolve(resBody);
              }
            );
          });

          if (body && !body.includes('profile_private_info') && !body.includes('id="loginForm"')) {
            const $ = Cheerio.load(body);
            $('.badge_card_set_card').each((_: any, el: any) => {
              const textContainer = $(el).find('.badge_card_set_text');
              let nameText = textContainer.clone().children().remove().end().text().trim();
              if (!nameText) {
                nameText = textContainer.text().trim().split('\n')[0].trim();
              }
              const imgEl = $(el).find('img');
              const imgSrc = imgEl.attr('src') || '';
              const cleanedName = cleanCardName(nameText);
              if (cleanedName && !cards.some((c) => c.cardName.toLowerCase() === cleanedName.toLowerCase())) {
                cards.push({
                  cardName: cleanedName,
                  cardImage: imgSrc,
                });
              }
            });

            if (cards.length > 0) break;
          }
        } catch {
          // Devam et
        }
      }
    }

    // 2. Yol (Garantili & Herkese Açık): Steam Topluluk Pazarı (Steam Market Search API)
    // Profil tamamen private olsa bile Steam Market'te o oyunun tüm kartları (Launch, Moment vb.) herkese açıktır!
    if (cards.length === 0) {
      try {
        const marketUrl = `https://steamcommunity.com/market/search/render/?query=&start=0&count=50&appid=753&category_753_Game%5B%5D=tag_app_${appId}&category_753_item_class%5B%5D=tag_item_class_2&norender=1`;

        let jsonStr = '';
        try {
          const res = await fetch(marketUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'tr-TR,tr;q=0.9,en-US,en;q=0.8',
            },
          });
          if (res.ok) {
            jsonStr = await res.text();
          }
        } catch {
          // fetch hatasında httpRequestGet dene
        }

        if (!jsonStr) {
          jsonStr = await new Promise((resolve, reject) => {
            this.community.httpRequestGet(
              {
                uri: marketUrl,
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept-Language': 'tr-TR,tr;q=0.9,en-US,en;q=0.8',
                },
              },
              (err: any, _res: any, body: string) => {
                if (err || !body) return reject(err || new Error('Empty market search'));
                resolve(body);
              }
            );
          });
        }

        const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        if (data && data.success && Array.isArray(data.results)) {
          // Normal kartları Foil (Parlak) kartların önüne al ki standart kart görseli ve ismi öncelikli olsun
          const sortedResults = [...data.results].sort((a, b) => {
            const aIsFoil = (a.name || '').includes('Foil') || (a.name || '').includes('Parlak');
            const bIsFoil = (b.name || '').includes('Foil') || (b.name || '').includes('Parlak');
            return (aIsFoil ? 1 : 0) - (bIsFoil ? 1 : 0);
          });

          for (const item of sortedResults) {
            const rawName = item.name || item.asset_description?.name || '';
            const cleanedName = cleanCardName(rawName);
            const imageHash =
              item.asset_description?.icon_url_large ||
              item.asset_description?.icon_url ||
              item.app_icon ||
              '';
            let cardImage = '';
            if (imageHash) {
              cardImage = imageHash.startsWith('http')
                ? imageHash
                : `https://community.cloudflare.steamstatic.com/economy/image/${imageHash}/360fx360f`;
            }

            if (cleanedName && !cards.some((c) => c.cardName.toLowerCase() === cleanedName.toLowerCase())) {
              cards.push({
                cardName: cleanedName,
                cardImage,
              });
            }
          }
        }
      } catch (marketErr) {
        console.warn(`[SteamClient] Market API fallback error for appId ${appId}:`, marketErr);
      }
    }

    if (cards.length > 0) {
      this.gameCardsMetaCache.set(appId, cards);
    }

    return cards;
  }

  public logOff(): void {
    this.stopPlaying();
    this.user.logOff();
    this.isCmConnected = false;
    this.isConnected = false;
    this.communityCookiesSet = false;
    this.currentAccountId = null;
  }

  public disconnect(): void {
    this.logOff();
  }

  public getIsConnected(): boolean {
    return this.isCmConnected || this.communityCookiesSet;
  }

  public getIsCmConnected(): boolean {
    return this.isCmConnected && !!this.user?.steamID;
  }

  public getCurrentAccountId(): string | null {
    return this.currentAccountId;
  }

  public getCurrentActiveGames(): number[] {
    return this.currentActiveGames;
  }
}

