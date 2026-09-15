import React, { useState, useMemo } from 'react';
import { CardDrop, Account, AppSettings } from '../../../shared/types';
import { getTranslations } from '../locales/i18n';
import { ConfirmModal } from './ConfirmModal';

interface MarketLootTabProps {
  cardDrops: CardDrop[];
  accounts: Account[];
  settings: AppSettings;
  lang: 'tr' | 'en';
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onRefreshDrops: () => void;
}

export const MarketLootTab: React.FC<MarketLootTabProps> = ({
  cardDrops,
  accounts,
  settings,
  lang,
  onUpdateSettings,
  onRefreshDrops,
}) => {
  const t = getTranslations(lang);
  const [selectedBotId, setSelectedBotId] = useState(accounts[0]?.id || '');
  const [targetMasterId, setTargetMasterId] = useState(settings.masterAccountId || accounts.find((a) => a.isMaster)?.id || '');
  const [isLooting, setIsLooting] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [lootMessage, setLootMessage] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [filterAccountId, setFilterAccountId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const handleSyncInventory = async () => {
    setIsSyncing(true);
    setSyncMessage(t.market.syncPromptScanning);
    try {
      const res = await window.api?.syncInventoryCards(selectedBotId);
      if (res?.message) {
        setSyncMessage(res.message);
        if (res.success) {
          onRefreshDrops();
        }
      }
    } catch (e: any) {
      setSyncMessage(`${t.market.errorPrefix} ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearHistory = () => {
    setIsClearConfirmOpen(true);
  };

  const handleConfirmClearHistory = async () => {
    setIsClearConfirmOpen(false);
    await window.api?.clearCardDrops(selectedBotId);
    onRefreshDrops();
    setSyncMessage(t.market.historyCleared);
  };

  const handleExecuteLoot = async () => {
    if (!selectedBotId || !targetMasterId) {
      setLootMessage(`⚠️ ${t.market.alertSelectAccounts}`);
      return;
    }

    if (selectedBotId === targetMasterId) {
      setLootMessage(`⚠️ ${t.market.alertSameAccount}`);
      return;
    }

    setIsLooting(true);
    setLootMessage(t.market.preparingTrade);

    try {
      const res = await window.api?.executeManualLoot(selectedBotId, targetMasterId);
      if (res) {
        setLootMessage(res.message);
        onRefreshDrops();
      }
    } catch (e: any) {
      setLootMessage(`${t.market.errorPrefix} ${e?.message || t.market.unknownError}`);
    } finally {
      setIsLooting(false);
    }
  };

  // Hesap bilgisi için yardımcı
  const getAccount = (accountId: string) => accounts.find((a) => a.id === accountId);

  // Kullanıcı bazlı filtreleme için hesaplar ve düşen kart sayıları listesi
  const filterAccounts = useMemo(() => {
    const accountMap = new Map<string, { id: string; name: string; avatarUrl?: string; isMaster?: boolean; dropCount: number }>();

    // Mevcut bağlı hesapları ekle
    for (const acc of accounts) {
      accountMap.set(acc.id, {
        id: acc.id,
        name: acc.accountName,
        avatarUrl: acc.avatarUrl,
        isMaster: acc.isMaster,
        dropCount: 0,
      });
    }

    // Kart drop'larını say ve haritada yoksa ekle
    for (const drop of cardDrops) {
      const existing = accountMap.get(drop.accountId);
      if (existing) {
        existing.dropCount += 1;
      } else {
        accountMap.set(drop.accountId, {
          id: drop.accountId,
          name: drop.accountId.slice(-6),
          dropCount: 1,
        });
      }
    }

    return Array.from(accountMap.values());
  }, [accounts, cardDrops]);

  // Filtrelenmiş drop listesi (Hesap + Arama sorgusu)
  const filteredDrops = useMemo(() => {
    let list = filterAccountId === 'all'
      ? cardDrops
      : cardDrops.filter((d) => d.accountId === filterAccountId);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((d) =>
        (d.gameTitle && d.gameTitle.toLowerCase().includes(q)) ||
        (d.cardName && d.cardName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [cardDrops, filterAccountId, searchQuery]);

  // Düşen kartların kopya ve benzersizlik hesaplamaları
  const cardOccurrences = useMemo(() => {
    // Kronolojik olarak sırala (en eskiden en yeniye)
    const sortedChronological = [...filteredDrops].sort(
      (a, b) => new Date(a.droppedAt).getTime() - new Date(b.droppedAt).getTime() || a.id - b.id
    );

    const copyIndexMap = new Map<number, number>();
    const currentCounterMap = new Map<string, number>();

    for (const drop of sortedChronological) {
      const key = `${drop.accountId}::${drop.appId}::${drop.cardName}`;
      const current = (currentCounterMap.get(key) || 0) + 1;
      currentCounterMap.set(key, current);
      copyIndexMap.set(drop.id, current);
    }

    const uniqueCardsCount = currentCounterMap.size;
    const totalDropsCount = filteredDrops.length;
    const duplicateDropsCount = Math.max(0, totalDropsCount - uniqueCardsCount);

    return {
      copyIndexMap,
      currentCounterMap,
      uniqueCardsCount,
      totalDropsCount,
      duplicateDropsCount,
    };
  }, [filteredDrops]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Grid: Market Settings + Loot Settings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Market Auto-Sell Box */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center' }}>
              📈 {t.market.autoSellTitle}
              <span
                className="market-beta-badge"
                title={t.market.betaTooltip || (lang === 'tr' ? 'Test Edilmemiştir: Bu özellik henüz tam olarak test edilmemiştir; herhangi bir sorun veya hata yaşanma ihtimali yüksektir.' : 'Untested: This feature has not been fully tested yet; there is a high likelihood of unexpected issues or errors.')}
              >
                {t.market.betaBadge || '(Beta)'}
              </span>
            </h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.autoSellCards}
                onChange={(e) => onUpdateSettings({ autoSellCards: e.target.checked })}
              />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                {settings.autoSellCards ? t.market.active : t.market.disabled}
              </span>
            </label>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            {t.market.autoSellDesc}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t.market.undercutLabel}
            </label>
            <input
              type="number"
              step="0.01"
              min="0.00"
              max="100.00"
              value={
                settings.autoSellUnderCut !== undefined
                  ? Number((Math.round(settings.autoSellUnderCut * 100) / 100).toFixed(2))
                  : 0.01
              }
              onKeyDown={(e) => {
                // Negatif ve üslü sayıları engelle
                if (e.key === '-' || e.key === 'e' || e.key === 'E') {
                  e.preventDefault();
                  return;
                }
                // Noktadan sonra zaten 2 basamak varken imleç ondalık kısımdaysa fazladan rakam girişini engelle
                const input = e.currentTarget;
                const val = input.value.replace(',', '.');
                const dotIdx = val.indexOf('.');
                if (
                  dotIdx !== -1 &&
                  /^\d$/.test(e.key) &&
                  input.selectionStart !== null &&
                  input.selectionStart > dotIdx &&
                  input.selectionStart === input.selectionEnd
                ) {
                  const decimals = val.slice(dotIdx + 1);
                  if (decimals.length >= 2) {
                    e.preventDefault();
                  }
                }
              }}
              onInput={(e) => {
                const target = e.currentTarget;
                const raw = target.value.replace(',', '.');
                const parts = raw.split('.');
                // Soldan, aradan veya sağdan 2 basamaktan fazla giriş yapıldığında anında 0.01 hassasiyetine yuvarla/engelle
                if (parts.length === 2 && parts[1].length > 2) {
                  const parsed = parseFloat(raw);
                  if (!isNaN(parsed)) {
                    const rounded = (Math.round(parsed * 100) / 100).toFixed(2);
                    target.value = rounded;
                    onUpdateSettings({ autoSellUnderCut: parseFloat(rounded) });
                  }
                }
              }}
              onChange={(e) => {
                const raw = e.target.value.replace(',', '.');
                if (raw === '') {
                  onUpdateSettings({ autoSellUnderCut: 0.01 });
                  return;
                }
                const parsed = parseFloat(raw);
                if (isNaN(parsed) || parsed < 0) {
                  onUpdateSettings({ autoSellUnderCut: 0.01 });
                  return;
                }
                const rounded = Math.round(parsed * 100) / 100;
                onUpdateSettings({ autoSellUnderCut: rounded });
              }}
              onBlur={(e) => {
                const parsed = parseFloat(e.target.value.replace(',', '.'));
                const clean = isNaN(parsed) || parsed < 0 ? 0.01 : Math.round(parsed * 100) / 100;
                e.target.value = clean.toFixed(2);
                onUpdateSettings({ autoSellUnderCut: clean });
              }}
              style={{
                width: '84px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                padding: '6px 8px',
                borderRadius: '6px',
                fontFamily: 'var(--font-mono)',
              }}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{settings.currencySymbol || '$'}</span>
          </div>
        </div>

        {/* Multi-Account Loot Box */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
            👑 {t.market.multiLootTitle}
            <span
              className="market-beta-badge"
              title={t.market.betaTooltip || (lang === 'tr' ? 'Test Edilmemiştir: Bu özellik henüz tam olarak test edilmemiştir; herhangi bir sorun veya hata yaşanma ihtimali yüksektir.' : 'Untested: This feature has not been fully tested yet; there is a high likelihood of unexpected issues or errors.')}
            >
              {t.market.betaBadge || '(Beta)'}
            </span>
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
            {t.market.multiLootDesc}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  {t.market.sourceAccountLabel}
                </label>
                <select
                  value={selectedBotId}
                  onChange={(e) => setSelectedBotId(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    padding: '8px',
                    borderRadius: '6px',
                  }}
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.accountName}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  {t.market.targetAccountLabel}
                </label>
                <select
                  value={targetMasterId}
                  onChange={(e) => {
                    setTargetMasterId(e.target.value);
                    onUpdateSettings({ masterAccountId: e.target.value });
                  }}
                  style={{
                    width: '100%',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    padding: '8px',
                    borderRadius: '6px',
                  }}
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.accountName} {acc.isMaster ? '👑' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleExecuteLoot}
              disabled={isLooting}
              style={{ marginTop: '6px' }}
            >
              🚀 {isLooting ? t.market.transferring : t.market.transferToMaster}
            </button>

            {lootMessage && (
              <p style={{ fontSize: '0.8rem', color: 'var(--neon-cyan)', marginTop: '4px' }}>
                {lootMessage}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Dropped Cards History Table */}
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                📦 {t.market.dropHistoryTitle}
              </h3>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.78rem' }}>
                <span
                  className="badge"
                  style={{
                    background: 'rgba(102, 192, 244, 0.15)',
                    color: 'var(--border-accent)',
                    border: '1px solid rgba(102, 192, 244, 0.3)',
                    fontWeight: 600,
                  }}
                  title={t.market.statTotal}
                >
                  {cardOccurrences.totalDropsCount} {t.market.statTotal}
                  {filterAccountId !== 'all' && ` / ${cardDrops.length}`}
                </span>
                <span
                  className="badge"
                  style={{
                    background: 'rgba(46, 204, 113, 0.15)',
                    color: '#2ecc71',
                    border: '1px solid rgba(46, 204, 113, 0.3)',
                    fontWeight: 600,
                  }}
                  title={t.market.statUnique}
                >
                  {cardOccurrences.uniqueCardsCount} {t.market.statUnique}
                </span>
                {cardOccurrences.duplicateDropsCount > 0 && (
                  <span
                    className="badge"
                    style={{
                      background: 'rgba(243, 156, 18, 0.15)',
                      color: '#f39c12',
                      border: '1px solid rgba(243, 156, 18, 0.35)',
                      fontWeight: 600,
                    }}
                    title={t.market.statDuplicates}
                  >
                    🔁 {cardOccurrences.duplicateDropsCount} {t.market.statDuplicates}
                  </span>
                )}
              </div>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {t.market.dropHistoryDesc}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={handleSyncInventory}
              disabled={isSyncing}
              style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              🔄 {isSyncing ? t.market.scanningInventory : t.market.syncFromInventory}
            </button>
            <button className="btn btn-secondary" onClick={onRefreshDrops} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
              🔃 {t.market.refresh}
            </button>
            {cardDrops.length > 0 && (
              <button
                className="btn btn-danger"
                onClick={handleClearHistory}
                style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                title={t.market.clearHistoryTitle}
              >
                🗑️ {t.market.clear}
              </button>
            )}
          </div>
        </div>

        {/* Kullanıcı Bazlı Filtreleme Barı & Arama Kutusu */}
        <div className="market-filter-bar">
          {/* Sol: Kullanıcı Pill'leri */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginRight: '4px' }}>
              👤 {t.market.filterByAccount}
            </span>

            {/* Tüm Hesaplar Pill */}
            <button
              type="button"
              onClick={() => setFilterAccountId('all')}
              className={`market-pill-btn ${filterAccountId === 'all' ? 'active' : ''}`}
            >
              <span>👥 {t.market.filterAllAccounts}</span>
              <span className="market-pill-badge">
                {cardDrops.length}
              </span>
            </button>

            {/* Her Bir Kullanıcı Pill */}
            {filterAccounts.map((acc) => {
              const isActive = filterAccountId === acc.id;
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => {
                    setFilterAccountId(acc.id);
                    setSelectedBotId(acc.id);
                  }}
                  className={`market-pill-btn ${isActive ? 'active' : ''}`}
                  title={`${acc.name} (${acc.dropCount} ${t.market.cardsUnit})`}
                >
                  {acc.avatarUrl ? (
                    <img
                      src={acc.avatarUrl}
                      alt={acc.name}
                      style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: '0.8rem' }}>👤</span>
                  )}
                  <span>{acc.name}</span>
                  {acc.isMaster && <span title="Master">👑</span>}
                  <span className="market-pill-badge">
                    {acc.dropCount}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sağ: Arama Inputu */}
          <div style={{ position: 'relative', minWidth: '180px', maxWidth: '240px' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.market.searchPlaceholder}
              className="market-search-input"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '6px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  padding: '2px',
                }}
              >
                ✕
              </button>
            ) : (
              <span
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              >
                🔍
              </span>
            )}
          </div>
        </div>

        {/* Canlı İstatistik Özet Kartları */}
        {filteredDrops.length > 0 && (() => {
          const totalCount = filteredDrops.length;
          const soldDrops = filteredDrops.filter((d) => d.isSold);
          const totalEarnings = soldDrops.reduce((acc, d) => acc + (d.soldPrice || 0), 0).toFixed(2);
          const lootedCount = filteredDrops.filter((d) => d.isLooted).length;
          const inInventoryCount = filteredDrops.filter((d) => !d.isSold && !d.isLooted).length;

          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '14px' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px 12px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>🎴 {t.market.statTotal}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>{totalCount}</div>
              </div>
              <div style={{ background: 'rgba(0, 242, 254, 0.04)', border: '1px solid rgba(0, 242, 254, 0.2)', borderRadius: '8px', padding: '8px 12px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--neon-cyan)', textTransform: 'uppercase', fontWeight: 600 }}>🎒 {t.market.inInventoryBadge}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--neon-cyan)', marginTop: '2px' }}>{inInventoryCount}</div>
              </div>
              <div style={{ background: 'rgba(46, 204, 113, 0.04)', border: '1px solid rgba(46, 204, 113, 0.2)', borderRadius: '8px', padding: '8px 12px' }}>
                <div style={{ fontSize: '0.72rem', color: '#2ecc71', textTransform: 'uppercase', fontWeight: 600 }}>🏷️ {t.market.soldBadge} ({soldDrops.length})</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2ecc71', marginTop: '2px' }}>{settings.currencySymbol || '$'}{totalEarnings}</div>
              </div>
              <div style={{ background: 'rgba(241, 196, 15, 0.04)', border: '1px solid rgba(241, 196, 15, 0.2)', borderRadius: '8px', padding: '8px 12px' }}>
                <div style={{ fontSize: '0.72rem', color: '#f1c40f', textTransform: 'uppercase', fontWeight: 600 }}>👑 {t.market.lootedBadge}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f1c40f', marginTop: '2px' }}>{lootedCount}</div>
              </div>
            </div>
          );
        })()}

        {syncMessage && (() => {
          const isWarning = syncMessage.includes('🔒') || syncMessage.toLowerCase().includes('private') || syncMessage.toLowerCase().includes('gizli');
          return (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: isWarning ? 'rgba(243, 156, 18, 0.12)' : 'rgba(102, 192, 244, 0.1)',
                border: isWarning ? '1px solid rgba(243, 156, 18, 0.45)' : '1px solid var(--border-accent)',
                color: isWarning ? '#f39c12' : 'var(--border-accent)',
                fontSize: '0.84rem',
                marginBottom: '14px',
                lineHeight: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{isWarning ? '⚠️' : 'ℹ️'}</span>
              <span>{syncMessage}</span>
            </div>
          );
        })()}

        {filteredDrops.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>📭</div>
            <div style={{ fontSize: '0.9rem', marginBottom: filterAccountId !== 'all' ? '14px' : '0' }}>
              {cardDrops.length === 0
                ? t.market.noDropsRecorded
                : (searchQuery
                    ? `${t.market.filterNoResults} ("${searchQuery}")`
                    : t.market.filterNoResults)}
            </div>
            {filterAccountId !== 'all' && (
              <button
                className="btn btn-primary"
                onClick={handleSyncInventory}
                disabled={isSyncing}
                style={{ padding: '6px 14px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                🔄 {isSyncing ? t.market.scanningInventory : t.market.scanThisAccount}
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px' }}>{t.market.tableGame}</th>
                  <th style={{ padding: '10px', width: '60px', textAlign: 'center' }}>{t.market.tableCard}</th>
                  <th style={{ padding: '10px' }}>{t.market.tableCardName}</th>
                  <th style={{ padding: '10px' }}>{t.market.tableAccount}</th>
                  <th style={{ padding: '10px' }}>{t.market.tableTime}</th>
                  <th style={{ padding: '10px' }}>{t.market.tableMarketStatus}</th>
                  <th style={{ padding: '10px' }}>{t.market.tableLootStatus}</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrops.map((drop) => {
                  const acc = getAccount(drop.accountId);

                  // Güvenlik ve temizlik katmanı: Parantezli uzantıları ve generic isimleri temizle
                  let displayCardName = drop.cardName || '';
                  displayCardName = displayCardName
                    .replace(/\s*\((?:Koleksiyon Kartı|Trading Card|Foil Trading Card|Parlak Koleksiyon Kartı|Foil|Parlak)\)/gi, '')
                    .replace(/\s*-(?:Koleksiyon Kartı|Trading Card|Foil Trading Card|Parlak Koleksiyon Kartı|Foil|Parlak)$/gi, '')
                    .replace(/\s*(?:Koleksiyon Kartı|Trading Card|Foil Trading Card|Parlak Koleksiyon Kartı)$/gi, '')
                    .trim();

                  if (drop.appId === 1225570 && (!displayCardName || displayCardName === 'Unravel Two')) {
                    displayCardName = 'Launch';
                  } else if (!displayCardName || (drop.gameTitle && displayCardName.toLowerCase() === drop.gameTitle.toLowerCase())) {
                    displayCardName = 'Koleksiyon Kartı';
                  }

                  let displayCardImage = drop.cardImage;
                  if (drop.appId === 1225570 && (!displayCardImage || displayCardImage.includes('apps/1225570/header.jpg'))) {
                    displayCardImage =
                      'https://community.cloudflare.steamstatic.com/economy/image/IzMF03bk9WpSBq-S-ekoE33L-iLqGFHVaU25ZzQNQcXdA3g5gMEPvUZZEfSMJ6dESN8p_2SVTY7V2NgNxnYJnz4QPivs0XEwSeR5NsjOhgz2oOWIQSygaTPGKnXdGAkwS-BaNGje-2bwsL-cRGuaE-F_EVtQLqAA-2BMOp2Xf0xqwtVUuWG9hXt0Excvd5gScVi6mndAMuwhnHZHJ5JVmHfxIsDZgF40bRdoXL3iB73EPYKgk3wiQ1o5SLZcaYkz4TzkxA/360fx360f';
                  }

                  return (
                  <tr key={drop.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px', fontWeight: 600, color: 'var(--text-primary)' }}>{drop.gameTitle}</td>
                    <td style={{ padding: '8px 10px', width: '60px', textAlign: 'center' }}>
                      {displayCardImage ? (
                        <div style={{ position: 'relative', width: '42px', height: '52px', margin: '0 auto' }}>
                          <img
                            src={displayCardImage}
                            alt={displayCardName}
                            title={`${drop.gameTitle} - ${displayCardName}`}
                            style={{
                              width: '42px',
                              height: '52px',
                              objectFit: 'cover',
                              borderRadius: '4px',
                              border: '1px solid var(--border-subtle)',
                              background: 'rgba(0, 0, 0, 0.5)',
                              transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s ease, border-color 0.2s ease',
                              cursor: 'pointer',
                              position: 'relative',
                              zIndex: 1,
                              transformOrigin: 'center center',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(2.2)';
                              e.currentTarget.style.zIndex = '50';
                              e.currentTarget.style.borderColor = 'var(--neon-cyan)';
                              e.currentTarget.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.95), 0 0 14px rgba(0, 242, 254, 0.4)';
                              if (e.currentTarget.parentElement) {
                                e.currentTarget.parentElement.style.zIndex = '50';
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)';
                              e.currentTarget.style.zIndex = '1';
                              e.currentTarget.style.borderColor = 'var(--border-subtle)';
                              e.currentTarget.style.boxShadow = 'none';
                              if (e.currentTarget.parentElement) {
                                e.currentTarget.parentElement.style.zIndex = '1';
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          style={{
                            width: '42px',
                            height: '52px',
                            margin: '0 auto',
                            borderRadius: '4px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.2rem',
                          }}
                        >
                          🃏
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--neon-cyan)', fontWeight: 600 }}>
                          {displayCardName}
                        </span>
                        {(() => {
                          const cardKey = `${drop.accountId}::${drop.appId}::${drop.cardName}`;
                          const totalCopies = cardOccurrences.currentCounterMap.get(cardKey) || 1;
                          const copyIdx = cardOccurrences.copyIndexMap.get(drop.id) || 1;
                          if (totalCopies > 1) {
                            return (
                              <span
                                className="badge"
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '2px 6px',
                                  background: copyIdx > 1 ? 'rgba(243, 156, 18, 0.18)' : 'rgba(102, 192, 244, 0.12)',
                                  color: copyIdx > 1 ? '#f39c12' : 'var(--border-accent)',
                                  border: copyIdx > 1 ? '1px solid rgba(243, 156, 18, 0.35)' : '1px solid rgba(102, 192, 244, 0.25)',
                                  fontWeight: 600,
                                }}
                                title={copyIdx > 1 ? `${drop.gameTitle} (${copyIdx}/${totalCopies})` : `1/${totalCopies}`}
                              >
                                {copyIdx > 1 ? `🔁 ${t.market.copyBadge.replace('{num}', String(copyIdx))}` : `(1/${totalCopies})`}
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </td>
                    {/* Hesap sütunu */}
                    <td style={{ padding: '10px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setFilterAccountId(drop.accountId);
                          setSelectedBotId(drop.accountId);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '7px',
                          background: 'transparent',
                          border: 'none',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        title={`${acc ? acc.accountName : drop.accountId}`}
                      >
                        {acc?.avatarUrl ? (
                          <img
                            src={acc.avatarUrl}
                            alt={acc.accountName}
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              border: '1px solid var(--border-subtle)',
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              background: 'rgba(102,192,244,0.18)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.7rem',
                              flexShrink: 0,
                            }}
                          >
                            👤
                          </div>
                        )}
                        <span
                          style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100px',
                          }}
                        >
                          {acc ? acc.accountName : drop.accountId.slice(-6)}
                        </span>
                        {acc?.isMaster && <span style={{ fontSize: '0.75rem' }} title="Master">👑</span>}
                      </button>
                    </td>
                    <td style={{ padding: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      {new Date(drop.droppedAt).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {drop.isSold ? (
                        <span className="badge badge-green">
                          {t.market.soldBadge} ({settings.currencySymbol || '$'}{drop.soldPrice})
                        </span>
                      ) : (
                        <span className="badge badge-cyan">{t.market.inInventoryBadge}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {drop.isLooted ? (
                        <span className="badge badge-gold">{t.market.lootedBadge}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modern Geçmişi Temizleme Onay Modalı */}
      <ConfirmModal
        isOpen={isClearConfirmOpen}
        title={t.market.clearHistoryModalTitle || t.market.clear}
        message={t.market.clearHistoryConfirm}
        confirmText={t.market.clearHistoryBtn || t.market.clear}
        cancelText={t.accounts?.cancelBtn || 'İptal'}
        type="warning"
        icon="🗑️"
        onConfirm={handleConfirmClearHistory}
        onCancel={() => setIsClearConfirmOpen(false)}
      />
    </div>
  );
};
