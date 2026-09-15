import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ActiveFarming } from './components/ActiveFarming';
import { GamesQueue } from './components/GamesQueue';
import { AccountsModal } from './components/AccountsModal';
import { MarketLootTab } from './components/MarketLootTab';
import { ProfitFinderTab } from './components/ProfitFinderTab';
import { SettingsModal } from './components/SettingsModal';
import { LogsPanel } from './components/LogsPanel';
import {
  Account,
  FarmingStatus,
  GameQueueItem,
  CardDrop,
  AppSettings,
  AppLog,
  SteamAlert,
} from '../../shared/types';
import { getTranslations } from './locales/i18n';

const defaultStatus: FarmingStatus = {
  isFarming: false,
  isPaused: false,
  pauseReason: null,
  rateLimitCountdownSeconds: 0,
  activePhase: 'idle',
  activeGames: [],
  totalCardsRemaining: 0,
  totalCardsDroppedSession: 0,
  totalCardsDroppedAllTime: 0,
  sessionElapsedSeconds: 0,
  nextCheckSecondsRemaining: 0,
  activeAccountId: null,
};

const defaultSettings: AppSettings = {
  language: 'tr',
  theme: 'steam',
  darkMode: true,
  defaultFarmingMode: 'standalone',
  idleStrategy: 'smart_hybrid',
  autoStartWithWindows: false,
  minimizeToTray: true,
  autoPauseWhenGameRuns: true,
  filterVacGames: true,
  personaState: 'invisible',
  pollIntervalMultiMinutes: 15,
  pollIntervalSoloMinutes: 5,
  autoSellCards: false,
  autoSellUnderCut: 0.01,
  autoLootToMaster: false,
  masterAccountId: null,
  blacklistAppIds: [730, 440, 570, 252490],
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'active' | 'queue' | 'market' | 'profitFinder' | 'logs'>('active');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [status, setStatus] = useState<FarmingStatus>(defaultStatus);
  const [queue, setQueue] = useState<GameQueueItem[]>([]);
  const [cardDrops, setCardDrops] = useState<CardDrop[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [lang, setLang] = useState<'tr' | 'en'>('tr');
  const [steamAlerts, setSteamAlerts] = useState<SteamAlert[]>([]);
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);

  // Sync theme & color mode to DOM
  useEffect(() => {
    const currentTheme = settings.theme || 'steam';
    const isDark = settings.darkMode !== false;
    document.documentElement.setAttribute('data-theme', currentTheme);
    document.documentElement.setAttribute('data-mode', isDark ? 'dark' : 'light');
  }, [settings.theme, settings.darkMode]);

  const [isScanningBadges, setIsScanningBadges] = useState(false);
  const [isStartingFarming, setIsStartingFarming] = useState(false);

  // Modals
  const [isAccountsOpen, setIsAccountsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [dropToast, setDropToast] = useState<CardDrop | null>(null);

  const t = getTranslations(lang);

  const loadInitialData = async () => {
    if (!window.api) return;

    try {
      const [accs, stat, sett, drps, lgs] = await Promise.all([
        window.api.getAccounts(),
        window.api.getFarmingStatus(),
        window.api.getSettings(),
        window.api.getCardDrops(),
        window.api.getLogs(),
      ]);

      setAccounts(accs || []);
      if (stat) setStatus(stat);
      if (sett) {
        setSettings(sett);
        setLang(sett.language || 'tr');
      }
      setCardDrops(drps || []);
      setLogs(lgs || []);

      const activeAcc = accs?.find((a) => a.isActive) || accs?.[0];
      if (activeAcc) {
        setActiveAccountId(activeAcc.id);
        const q = await window.api.getQueue(activeAcc.id);
        setQueue(q || []);
      }
    } catch (e) {
      console.error('Error loading initial data:', e);
    }
  };

  useEffect(() => {
    loadInitialData();

    if (!window.api) return;

    // Subscriptions
    const unsubStatus = window.api.onFarmingStatusChanged((newStatus) => {
      setStatus(newStatus);
    });

    const unsubDrop = window.api.onCardDropped((drop) => {
      setDropToast(drop);
      setCardDrops((prev) => [drop, ...prev]);
      setTimeout(() => setDropToast(null), 6000);
    });

    const unsubLog = window.api.onLogAdded((newLog) => {
      setLogs((prev) => [newLog, ...prev]);
    });

    const unsubAccounts = window.api.onAccountsUpdated?.((newAccounts) => {
      setAccounts(newAccounts);
      const active = newAccounts.find((a) => a.isActive) || newAccounts[0];
      if (active) {
        setActiveAccountId(active.id);
        window.api?.getQueue(active.id).then((q) => setQueue(q || []));
      }
    });

    const unsubQueue = window.api.onQueueUpdated?.((newQueue) => {
      setQueue(newQueue || []);
    });

    const unsubSteamAlert = window.api.onSteamAlert?.((alert) => {
      setSteamAlerts((prev) => {
        // Aynı titleKey'in tekrarını bastaletı
        const alreadyExists = prev.some((a) => a.titleKey === alert.titleKey);
        if (alreadyExists) {
          // güncelle (yeni timestamp)
          return prev.map((a) => a.titleKey === alert.titleKey ? alert : a);
        }
        return [alert, ...prev];
      });
    });

    return () => {
      unsubStatus?.();
      unsubDrop?.();
      unsubLog?.();
      unsubAccounts?.();
      unsubQueue?.();
      unsubSteamAlert?.();
    };
  }, []);

  const handleToggleLang = async () => {
    const nextLang = lang === 'tr' ? 'en' : 'tr';
    setLang(nextLang);
    await window.api?.updateSettings({ language: nextLang });
  };

  const handleStartFarming = async () => {
    if (accounts.length === 0) {
      setIsAccountsOpen(true);
      return;
    }
    setIsStartingFarming(true);
    try {
      await window.api?.startFarming(activeAccountId || undefined);
      const newStatus = await window.api?.getFarmingStatus();
      if (newStatus) setStatus(newStatus);
      if (activeAccountId) {
        const q = await window.api?.getQueue(activeAccountId);
        if (q) setQueue(q);
      }
    } catch (e) {
      console.error('Error starting farming:', e);
    } finally {
      setIsStartingFarming(false);
    }
  };

  const handleStopFarming = async () => {
    await window.api?.stopFarming();
    const newStatus = await window.api?.getFarmingStatus();
    if (newStatus) setStatus(newStatus);
  };

  const handlePauseFarming = async () => {
    await window.api?.pauseFarming();
  };

  const handleResumeFarming = async () => {
    await window.api?.resumeFarming();
  };

  const handleForceCheck = async () => {
    await window.api?.forceCheckCards();
  };

  const handleStartNow = async (appId: number) => {
    await window.api?.startFarmingGameNow(appId);
    setActiveTab('active');
  };

  const handleRemoveGame = async (appId: number) => {
    await window.api?.removeGameFromQueue(appId);
    if (activeAccountId) {
      const q = await window.api?.getQueue(activeAccountId);
      setQueue(q || []);
    }
  };

  const handleRefreshBadges = async () => {
    if (!activeAccountId) return;
    setIsScanningBadges(true);
    try {
      const q = await window.api?.refreshBadges(activeAccountId);
      if (q) setQueue(q);
    } catch (err) {
      console.error('Error refreshing badges:', err);
    } finally {
      setIsScanningBadges(false);
    }
  };

  const handleReorder = async (order: number[]) => {
    await window.api?.updateQueueOrder(order);
    if (activeAccountId) {
      const q = await window.api?.getQueue(activeAccountId);
      setQueue(q || []);
    }
  };

  const handleToggleHideGame = async (appId: number, isHidden: boolean) => {
    await window.api?.toggleHideGame(appId, isHidden);
    if (activeAccountId) {
      const q = await window.api?.getQueue(activeAccountId);
      setQueue(q || []);
    }
  };

  const handleToggleHideAll = async (isHidden: boolean) => {
    if (!activeAccountId) return;
    await window.api?.toggleHideAllGames(activeAccountId, isHidden);
    const q = await window.api?.getQueue(activeAccountId);
    setQueue(q || []);
  };

  const handleUpdateSettings = async (newSettings: Partial<AppSettings>) => {
    const updated = await window.api?.updateSettings(newSettings);
    if (updated) setSettings(updated);
  };

  const handleSelectAccount = async (id: string) => {
    setActiveAccountId(id);
    await window.api?.setActiveAccount?.(id);
    const [updatedAccounts, updatedSettings, q] = await Promise.all([
      window.api?.getAccounts?.(),
      window.api?.getSettings?.(),
      window.api?.getQueue?.(id),
    ]);
    if (updatedAccounts) setAccounts(updatedAccounts);
    if (updatedSettings) setSettings(updatedSettings);
    setQueue(q || []);
  };

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0] || null;
  const activeGamesCount = queue.filter((g) => !g.isBlacklisted).length;

  return (
    <div
      className={`app-container theme-${settings.theme || 'steam'} mode-${settings.darkMode !== false ? 'dark' : 'light'}`}
      data-theme={settings.theme || 'steam'}
      data-mode={settings.darkMode !== false ? 'dark' : 'light'}
    >
      {/* Titlebar Header */}
      <Header
        activeAccount={activeAccount}
        accounts={accounts}
        status={status}
        lang={lang}
        personaState={settings.personaState}
        onToggleLang={handleToggleLang}
        onOpenAccounts={() => setIsAccountsOpen(true)}
        onSelectAccount={handleSelectAccount}
      />

      {/* Navigation Tabs */}
      <div className="nav-tabs">
        <button
          className={`nav-tab-btn ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          ⚡ {t.nav.active}
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          🎮 {t.nav.queue} ({activeGamesCount})
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'market' ? 'active' : ''}`}
          onClick={() => setActiveTab('market')}
        >
          💎 {t.nav.market}
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'profitFinder' ? 'active' : ''}`}
          onClick={() => setActiveTab('profitFinder')}
        >
          {t.nav.profitFinder}
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          📋 {t.nav.logs}
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button
            className="nav-tab-btn"
            onClick={() => setIsAccountsOpen(true)}
            title={t.nav.manageAccountsTitle}
          >
            👥 {t.nav.accounts}
          </button>
          <button
            className="nav-tab-btn"
            onClick={() => setIsSettingsOpen(true)}
            title={t.nav.settingsTitle}
          >
            ⚙️ {t.nav.settings}
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <main className="main-content">
        {activeTab === 'active' && (
          <ActiveFarming
            status={status}
            lang={lang}
            currentStrategy={settings.idleStrategy || 'smart_hybrid'}
            onStrategyChange={async (newStrategy) => {
              await handleUpdateSettings({ idleStrategy: newStrategy });
            }}
            isStarting={isStartingFarming}
            onStart={handleStartFarming}
            onStop={handleStopFarming}
            onPause={handlePauseFarming}
            onResume={handleResumeFarming}
            onForceCheck={handleForceCheck}
          />
        )}

        {activeTab === 'queue' && (
          <GamesQueue
            queue={queue}
            lang={lang}
            isScanning={isScanningBadges}
            onStartNow={handleStartNow}
            onRemove={handleRemoveGame}
            onToggleHide={handleToggleHideGame}
            onToggleHideAll={handleToggleHideAll}
            onRefreshBadges={handleRefreshBadges}
            onReorder={handleReorder}
          />
        )}

        {activeTab === 'market' && (
          <MarketLootTab
            cardDrops={cardDrops}
            accounts={accounts}
            settings={settings}
            lang={lang}
            onUpdateSettings={handleUpdateSettings}
            onRefreshDrops={async () => {
              const d = await window.api?.getCardDrops();
              if (d) setCardDrops(d);
            }}
          />
        )}

        {activeTab === 'profitFinder' && (
          <ProfitFinderTab
            lang={lang}
            currencySymbol={settings.currencySymbol || '$'}
          />
        )}

        {activeTab === 'logs' && (
          <LogsPanel
            logs={logs}
            lang={lang}
            onClearLogs={async () => {
              await window.api?.clearLogs();
              setLogs([]);
            }}
          />
        )}
      </main>

      {/* Accounts Modal */}
      <AccountsModal
        isOpen={isAccountsOpen}
        accounts={accounts}
        farmingStatus={status}
        lang={lang}
        onClose={() => setIsAccountsOpen(false)}
        onRefreshAccounts={async () => {
          const accs = await window.api?.getAccounts();
          setAccounts(accs || []);
        }}
        onSelectAccount={handleSelectAccount}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        lang={lang}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleUpdateSettings}
        accounts={accounts}
        activeAccountId={activeAccountId}
      />

      {/* Steam Alert Banners */}
      {steamAlerts.length > 0 && (
        <div style={{ position: 'fixed', top: '48px', left: 0, right: 0, zIndex: 9000, display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 16px', pointerEvents: 'none' }}>
          {steamAlerts.map((alert) => {
            const alertT = t.steamAlert as Record<string, string>;
            const title = alertT[alert.titleKey.replace('steamAlert.', '')] || alert.titleKey;
            const message = alertT[alert.messageKey.replace('steamAlert.', '')] || alert.messageKey;
            const isExpanded = expandedAlertId === alert.id;
            const bgColor = alert.type === 'error' ? 'rgba(220,38,38,0.18)' : alert.type === 'warn' ? 'rgba(245,158,11,0.18)' : 'rgba(59,130,246,0.18)';
            const borderColor = alert.type === 'error' ? '#dc2626' : alert.type === 'warn' ? '#f59e0b' : '#3b82f6';
            const iconColor = alert.type === 'error' ? '#f87171' : alert.type === 'warn' ? '#fbbf24' : '#60a5fa';
            return (
              <div
                key={alert.id}
                style={{
                  pointerEvents: 'all',
                  background: bgColor,
                  border: `1px solid ${borderColor}`,
                  borderLeft: `4px solid ${borderColor}`,
                  borderRadius: '10px',
                  padding: '10px 14px',
                  backdropFilter: 'blur(12px)',
                  boxShadow: `0 4px 24px ${borderColor}33`,
                  animation: 'slideInDown 0.3s ease',
                  maxWidth: '620px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ fontSize: '1.2rem', marginTop: '1px', color: iconColor }}>🔔</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: iconColor, marginBottom: '3px' }}>{title}</div>
                    <div style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.82)', lineHeight: 1.4 }}>{message}</div>
                    {alert.rawMessage && (
                      <button
                        onClick={() => setExpandedAlertId(isExpanded ? null : alert.id)}
                        style={{ marginTop: '6px', background: 'none', border: 'none', cursor: 'pointer', color: iconColor, fontSize: '0.76rem', padding: 0, opacity: 0.8 }}
                      >
                        {isExpanded ? '▲' : '▼'} {alertT['details'] || 'Teknik Detay'}
                      </button>
                    )}
                    {isExpanded && alert.rawMessage && (
                      <div style={{ marginTop: '6px', fontFamily: 'monospace', fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '6px 8px', wordBreak: 'break-all' }}>
                        {alert.rawMessage}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setSteamAlerts((prev) => prev.filter((a) => a.id !== alert.id))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: '1rem', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                    title={alertT['dismiss'] || 'Kapat'}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toast Notification when a card drops! */}
      {dropToast && (
        <div className="drop-toast" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {dropToast.cardImage ? (
            <img
              src={dropToast.cardImage}
              alt="Card"
              style={{ width: '40px', height: '50px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--neon-cyan)', background: 'rgba(0,0,0,0.5)' }}
            />
          ) : (
            <span style={{ fontSize: '1.4rem' }}>🎉</span>
          )}
          <div>
            <div style={{ fontSize: '0.95rem' }}>{t.messages.cardDroppedToast}</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>
              [{dropToast.gameTitle}] {dropToast.cardName}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
