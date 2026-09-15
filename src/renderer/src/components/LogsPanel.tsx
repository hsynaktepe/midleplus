import React from 'react';
import { AppLog } from '../../../shared/types';
import { getTranslations } from '../locales/i18n';

interface LogsPanelProps {
  logs: AppLog[];
  lang: 'tr' | 'en';
  onClearLogs: () => void;
}

export function formatLogMessage(message: string, isTurkish: boolean): string {
  if (!message) return '';

  if (isTurkish) {
    if (message.includes('initialized and ready') || message.includes('başlatıldı ve hazır')) return 'Mega Idle Plus (Midle+) v1.0 başlatıldı ve hazır.';
    if (message.includes('Connecting to Steam network')) return 'Steam ağına bağlanılıyor...';
    if (message.includes('Checking card drop status')) return 'Kart düşme durumu denetleniyor...';
    if (message.includes('Game process closed, card farming resumed') || message.includes('Game closed, card farming resumed')) {
      return 'Oyun kapatıldı, kart düşürme kaldığı yerden devam ediyor.';
    }
    if (message.includes('Rate limit cooldown expired')) return 'İstek limiti bekleme süresi doldu, kart düşürme devam ediyor.';
    if (message.includes('Scanning library badges')) return 'Kütüphanedeki rozetler ve kart hakkı olan oyunlar taranıyor...';
    if (message.includes('Card farming engine stopped')) return 'Kart düşürme motoru durduruldu.';
    if (message.includes('Paused by user')) return 'Kullanıcı tarafından duraklatıldı.';
    if (message.includes('Farming failed: No active Steam account found')) return 'Farming başlatılamadı: Kayıtlı aktif bir Steam hesabı bulunamadı.';
    if (message.includes('Badge scan failed: No active Steam account selected')) return 'Rozet tarama başarısız: Kayıtlı aktif bir Steam hesabı seçilmedi.';
    if (message.includes('Steam session expired')) return 'Steam oturumunun süresi dolmuş, lütfen QR ile tekrar bağlanın.';
    if (message.includes('No games with remaining card drops found')) return 'Kütüphanenizde kart düşürme hakkı olan oyun bulunmuyor veya tüm kartlar tamamlanmış.';

    let m = message.match(/🎉 \[(.*?)\] (?:account )?successfully connected/i);
    if (m) return `🎉 [${m[1]}] hesabı Steam Mobil QR kodu ile başarıyla bağlandı!`;

    m = message.match(/Game (?:process )?detected on computer \((.*?)\)/i);
    if (m) return `Bilgisayarda oyun algılandı (${m[1]}), kart düşürme otomatik duraklatıldı.`;

    m = message.match(/Steam rate limit exceeded \(HTTP 429\)\. Waiting (\d+) minutes/i);
    if (m) return `Steam istek limiti aşıldı (HTTP 429). Güvenlik için ${m[1]} dakika bekleniyor.`;

    m = message.match(/Card farming engine started for account (.*?)\./i);
    if (m) return `${m[1]} hesabı için kart düşürme motoru başlatıldı.`;

    m = message.match(/Fast Warm-Up Mode: Simulating (\d+) games/i);
    if (m) return `Hızlı Ön Isınma Modu: ${m[1]} oyun eşzamanlı olarak 2 saate ulaştırılıyor...`;

    m = message.match(/Smart Solo Idling: Simulating "(.*?)" \(Remaining Cards: (\d+)\)/i);
    if (m) return `Akıllı Solo Düşürme: "${m[1]}" simüle ediliyor (Kalan Kart: ${m[2]}).`;

    m = message.match(/Solo Idling: Simulating "(.*?)" \(Remaining Cards: (\d+)\)/i);
    if (m) return `Solo Düşürme: "${m[1]}" simüle ediliyor (Kalan Kart: ${m[2]}).`;

    m = message.match(/Simultaneous Idling Mode: Simulating (\d+) games/i);
    if (m) return `Eşzamanlı Çoklu Mod: ${m[1]} oyun aynı anda simüle ediliyor...`;

    m = message.match(/🎉 New card dropped! \[(.*?)\]/i);
    if (m) return `🎉 Yeni kart düştü! [${m[1]}]`;

    m = message.match(/🎉 Card dropped! \((\d+) cards remaining\) \[(.*?)\]/i);
    if (m) return `🎉 Kart düştü! (${m[1]} kart kaldı) [${m[2]}]`;

    m = message.match(/\[Market Sale\] Listed "(.*?)" (?:card )?for sale at ([^\s]+?)\.?$/i);
    if (m) return `[Pazar Satışı] "${m[1]}" kartı ${m[2]} fiyattan satışa listelendi.`;

    m = message.match(/Badge scan completed: (\d+) games with card drops queued/i);
    if (m) return `Rozet taraması tamamlandı: ${m[1]} adet kart hakkı olan oyun kuyruğa eklendi.`;

    m = message.match(/(\d+) games with (?:remaining )?card drops detected/i);
    if (m) return `${m[1]} adet kart hakkı olan oyun tespit edildi.`;

    m = message.match(/Badge scan error: (.*)/i);
    if (m) return `Rozet tarama hatası: ${m[1]}`;

    m = message.match(/Steam (?:durum tercihi|persona status preference updated to) "(.*?)"/i);
    if (m) return `Steam durum tercihi "${m[1]}" olarak güncellendi.`;

    return message;
  }

  // English translation
  if (message.includes('başlatıldı ve hazır') || message.includes('initialized and ready')) return 'Mega Idle Plus (Midle+) v1.1 initialized and ready.';
  if (message.includes('Steam ağına bağlanılıyor')) return 'Connecting to Steam network...';
  if (message.includes('Kart düşme durumu denetleniyor')) return 'Checking card drop status...';
  if (message.includes('Oyun kapatıldı, kart düşürme')) return 'Game process closed, card farming resumed.';
  if (message.includes('İstek limiti bekleme süresi doldu')) return 'Rate limit cooldown expired, card farming resumed.';
  if (message.includes('Kullanıcı tarafından duraklatıldı')) return 'Paused by user.';
  if (message.includes('Kart düşürme motoru durduruldu')) return 'Card farming engine stopped.';
  if (message.includes('Farming başlatılamadı: Kayıtlı aktif')) return 'Farming failed: No active Steam account found.';
  if (message.includes('Rozet tarama başarısız: Kayıtlı aktif')) return 'Badge scan failed: No active Steam account selected.';
  if (message.includes('Steam oturumunun süresi dolmuş')) return 'Steam session expired, please reconnect via QR code.';
  if (message.includes('kart düşürme hakkı olan oyun bulunmuyor') || message.includes('oyun bulunamadı veya tüm kartlar')) {
    return 'No games with remaining card drops found in your library or all cards completed.';
  }
  if (message.includes('rozetler ve kart hakkı olan oyunlar taranıyor') || message.includes('rozetleri ve kart hakkı olan')) {
    return 'Scanning library badges and games with remaining card drops...';
  }

  let m = message.match(/🎉 \[(.*?)\] hesabı Steam Mobil QR kodu ile başarıyla bağlandı!/i);
  if (m) return `🎉 [${m[1]}] account successfully connected via Steam Mobile QR code!`;

  m = message.match(/Bilgisayarda oyun algılandı \((.*?)\), kart düşürme otomatik duraklatıldı\./i);
  if (m) return `Game detected on computer (${m[1]}), card farming paused automatically.`;

  m = message.match(/Steam istek limiti aşıldı \(HTTP 429\)\. Güvenlik için (\d+) dakika bekleniyor\./i);
  if (m) return `Steam rate limit exceeded (HTTP 429). Waiting ${m[1]} minutes for safety.`;

  m = message.match(/^(.*?) hesabı için kart düşürme motoru başlatıldı\.$/i);
  if (m) return `Card farming engine started for account ${m[1]}.`;

  m = message.match(/Hızlı Ön Isınma Modu: (\d+) oyun eşzamanlı olarak 2 saate ulaştırılıyor\.\.\./i);
  if (m) return `Fast Warm-Up Mode: Simulating ${m[1]} games simultaneously to reach 2 hours...`;

  m = message.match(/Akıllı Solo Düşürme: "(.*?)" simüle ediliyor \(Kalan Kart: (\d+)\)\./i);
  if (m) return `Smart Solo Idling: Simulating "${m[1]}" (Remaining Cards: ${m[2]}).`;

  m = message.match(/Solo Düşürme: "(.*?)" simüle ediliyor \(Kalan Kart: (\d+)\)\./i);
  if (m) return `Solo Idling: Simulating "${m[1]}" (Remaining Cards: ${m[2]}).`;

  m = message.match(/Eşzamanlı Çoklu Mod: (\d+) oyun aynı anda simüle ediliyor\.\.\./i);
  if (m) return `Simultaneous Idling Mode: Simulating ${m[1]} games at the same time...`;

  m = message.match(/🎉 Yeni kart düştü! \[(.*?)\]/i);
  if (m) return `🎉 New card dropped! [${m[1]}]`;

  m = message.match(/🎉 Kart düştü! \((\d+) kart kaldı\) \[(.*?)\]/i);
  if (m) return `🎉 Card dropped! (${m[1]} cards remaining) [${m[2]}]`;

  m = message.match(/\[Pazar Satışı\] "(.*?)" kartı ([^\s]+) (?:fiyattan|üzerinden) satışa listelendi\./i);
  if (m) return `[Market Sale] Listed "${m[1]}" for sale at ${m[2]}.`;

  m = message.match(/Rozet taraması tamamlandı: (\d+) adet kart hakkı olan oyun/i);
  if (m) return `Badge scan completed: ${m[1]} games with card drops queued.`;

  m = message.match(/(\d+) adet kart hakkı olan oyun/i);
  if (m) return `${m[1]} games with remaining card drops detected.`;

  m = message.match(/Steam (?:durum tercihi|persona status preference updated to) "(.*?)"/i);
  if (m) {
    const rawState = m[1];
    let enState = rawState;
    if (rawState.includes('Görünmez') || rawState.includes('Invisible')) enState = 'Invisible';
    else if (rawState.includes('Çevrimiçi') || rawState.includes('Online')) enState = 'Online';
    else if (rawState.includes('Çevrimdışı') || rawState.includes('Offline')) enState = 'Offline';
    return `Steam persona status preference updated to "${enState}".`;
  }

  m = message.match(/Rozet tarama hatası: (.*)/i);
  if (m) return `Badge scan error: ${m[1]}`;

  return message;
}

export const LogsPanel: React.FC<LogsPanelProps> = ({ logs, lang, onClearLogs }) => {
  const t = getTranslations(lang);
  const isTurkish = lang === 'tr';

  const [activeLevels, setActiveLevels] = React.useState<Set<string>>(
    new Set(['info', 'warn', 'success', 'error'])
  );

  const normalizeLevel = (level?: string): 'info' | 'warn' | 'success' | 'error' => {
    if (level === 'warning' || level === 'warn') return 'warn';
    if (level === 'success') return 'success';
    if (level === 'error') return 'error';
    return 'info';
  };

  const counts = React.useMemo(() => {
    const res = { total: logs.length, info: 0, warn: 0, success: 0, error: 0 };
    for (const log of logs) {
      const lvl = normalizeLevel(log.level);
      res[lvl]++;
    }
    return res;
  }, [logs]);

  const filteredLogs = React.useMemo(() => {
    return logs.filter((log) => activeLevels.has(normalizeLevel(log.level)));
  }, [logs, activeLevels]);

  const toggleLevel = (lvl: 'info' | 'warn' | 'success' | 'error', e: React.MouseEvent) => {
    if (e.altKey || e.shiftKey) {
      setActiveLevels(new Set([lvl]));
      return;
    }

    setActiveLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) {
        next.delete(lvl);
      } else {
        next.add(lvl);
      }
      return next;
    });
  };

  const isolateLevel = (lvl: 'info' | 'warn' | 'success' | 'error') => {
    setActiveLevels(new Set([lvl]));
  };

  const showAll = () => {
    setActiveLevels(new Set(['info', 'warn', 'success', 'error']));
  };

  const allActive = activeLevels.size === 4;

  const getLevelBadge = (level: AppLog['level']) => {
    const norm = normalizeLevel(level);
    switch (norm) {
      case 'success':
        return <span className="badge badge-green">{t.logs.badgeSuccess}</span>;
      case 'warn':
        return <span className="badge badge-gold">{t.logs.badgeWarn}</span>;
      case 'error':
        return <span className="badge badge-red">{t.logs.badgeError}</span>;
      default:
        return <span className="badge badge-cyan">{t.logs.badgeInfo}</span>;
    }
  };

  // Filter button style helper
  const getFilterBtnStyle = (
    lvl: 'info' | 'warn' | 'success' | 'error',
    activeColor: string,
    activeBg: string,
    activeBorder: string
  ): React.CSSProperties => {
    const isActive = activeLevels.has(lvl);
    if (isActive) {
      return {
        padding: '5px 11px',
        fontSize: '0.78rem',
        fontWeight: 600,
        borderRadius: '6px',
        border: `1px solid ${activeBorder}`,
        background: activeBg,
        color: activeColor,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'all 0.18s ease',
        userSelect: 'none',
        boxShadow: `0 0 8px ${activeBg}`
      };
    }
    // Struck-through / Hidden style
    return {
      padding: '5px 11px',
      fontSize: '0.78rem',
      fontWeight: 500,
      borderRadius: '6px',
      border: '1px dashed rgba(255, 255, 255, 0.15)',
      background: 'rgba(255, 255, 255, 0.03)',
      color: 'var(--text-muted, #7a8b9e)',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      textDecoration: 'line-through',
      textDecorationThickness: '2px',
      opacity: 0.45,
      filter: 'grayscale(85%)',
      transition: 'all 0.18s ease',
      userSelect: 'none'
    };
  };

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
          📋 {t.logs.title} ({filteredLogs.length !== logs.length ? `${filteredLogs.length} / ${logs.length}` : logs.length})
        </h3>
        <button className="btn btn-secondary" onClick={onClearLogs} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
          🗑️ {t.logs.clearLogs}
        </button>
      </div>

      {/* Filter Bar */}
      <div className="log-filter-bar">
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginRight: '4px' }}>
          🎯 {t.logs.filterPrefix}
        </span>

        {/* All Button */}
        <button
          type="button"
          onClick={showAll}
          title={t.logs.filterAllHint}
          className={`log-filter-btn ${allActive ? 'active' : ''}`}
          style={{
            padding: '5px 12px',
            fontSize: '0.78rem',
            fontWeight: 700,
            borderRadius: '6px',
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'all 0.18s ease',
            border: allActive ? '1px solid #1a9fff' : '1px solid rgba(255, 255, 255, 0.12)',
            background: allActive ? 'linear-gradient(135deg, #0078d4, #00b4d8)' : 'rgba(255, 255, 255, 0.06)',
            color: allActive ? '#ffffff' : 'var(--text-muted)',
            boxShadow: allActive ? '0 0 10px rgba(0, 180, 216, 0.35)' : 'none'
          }}
        >
          {t.logs.filterAll} ({counts.total})
        </button>

        {/* Info Button */}
        <button
          type="button"
          onClick={(e) => toggleLevel('info', e)}
          onDoubleClick={() => isolateLevel('info')}
          title={t.logs.filterHint}
          className={`log-filter-btn ${activeLevels.has('info') ? 'active' : 'hidden-lvl'}`}
          style={getFilterBtnStyle(
            'info',
            '#00d1ff',
            'rgba(0, 209, 255, 0.12)',
            'rgba(0, 209, 255, 0.4)'
          )}
        >
          <span>ℹ️</span>
          <span>{t.logs.filterInfo}</span>
          <span style={{ opacity: 0.85, fontSize: '0.74rem' }}>({counts.info})</span>
        </button>

        {/* Success Button */}
        <button
          type="button"
          onClick={(e) => toggleLevel('success', e)}
          onDoubleClick={() => isolateLevel('success')}
          title={t.logs.filterHint}
          className={`log-filter-btn ${activeLevels.has('success') ? 'active' : 'hidden-lvl'}`}
          style={getFilterBtnStyle(
            'success',
            '#2ecc71',
            'rgba(46, 204, 113, 0.12)',
            'rgba(46, 204, 113, 0.4)'
          )}
        >
          <span>✅</span>
          <span>{t.logs.filterSuccess}</span>
          <span style={{ opacity: 0.85, fontSize: '0.74rem' }}>({counts.success})</span>
        </button>

        {/* Warn Button */}
        <button
          type="button"
          onClick={(e) => toggleLevel('warn', e)}
          onDoubleClick={() => isolateLevel('warn')}
          title={t.logs.filterHint}
          className={`log-filter-btn ${activeLevels.has('warn') ? 'active' : 'hidden-lvl'}`}
          style={getFilterBtnStyle(
            'warn',
            '#f39c12',
            'rgba(243, 156, 18, 0.14)',
            'rgba(243, 156, 18, 0.45)'
          )}
        >
          <span>⚠️</span>
          <span>{t.logs.filterWarn}</span>
          <span style={{ opacity: 0.85, fontSize: '0.74rem' }}>({counts.warn})</span>
        </button>

        {/* Error Button */}
        <button
          type="button"
          onClick={(e) => toggleLevel('error', e)}
          onDoubleClick={() => isolateLevel('error')}
          title={t.logs.filterHint}
          className={`log-filter-btn ${activeLevels.has('error') ? 'active' : 'hidden-lvl'}`}
          style={getFilterBtnStyle(
            'error',
            '#e74c3c',
            'rgba(231, 76, 60, 0.15)',
            'rgba(231, 76, 60, 0.45)'
          )}
        >
          <span>❌</span>
          <span>{t.logs.filterError}</span>
          <span style={{ opacity: 0.85, fontSize: '0.74rem' }}>({counts.error})</span>
        </button>

        {/* Hint text */}
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            opacity: 0.7
          }}
          className="log-filter-desktop-hint"
        >
          💡 {t.logs.filterHint}
        </span>
      </div>

      {/* Console Area */}
      <div className="logs-console" style={{ flex: 1, overflowY: 'auto' }}>
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
            {t.logs.noLogs}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
            <p style={{ marginBottom: '12px' }}>{t.logs.noFilteredLogs}</p>
            <button className="btn btn-secondary" onClick={showAll} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
              🔄 {t.logs.filterAll} ({t.logs.filterAllHint})
            </button>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="log-entry-row">
              <span className="log-timestamp">
                {new Date(log.timestamp).toLocaleTimeString(isTurkish ? 'tr-TR' : 'en-US')}
              </span>
              <span>{getLevelBadge(log.level)}</span>
              <span className="log-message">
                {formatLogMessage(log.message, isTurkish)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
