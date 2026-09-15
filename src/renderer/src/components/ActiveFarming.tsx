import React from 'react';
import { FarmingStatus, IdleStrategy } from '../../../shared/types';
import { getTranslations } from '../locales/i18n';

interface ActiveFarmingProps {
  status: FarmingStatus;
  lang: 'tr' | 'en';
  currentStrategy?: IdleStrategy;
  onStrategyChange?: (strategy: IdleStrategy) => void;
  isStarting?: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onForceCheck: () => void;
}

export const ActiveFarming: React.FC<ActiveFarmingProps> = ({
  status,
  lang,
  currentStrategy,
  onStrategyChange,
  isStarting,
  onStart,
  onStop,
  onPause,
  onResume,
  onForceCheck,
}) => {
  const t = getTranslations(lang);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs > 0 ? hrs + ':' : ''}${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Multi-Instance Simultaneous Farming Banner */}
      {(() => {
        const runningSessions = Object.entries(status.multiStatus || {}).filter(([_, s]) => s.isFarming);
        if (runningSessions.length > 1) {
          return (
            <div
              className="glass-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                borderColor: 'rgba(56, 189, 248, 0.4)',
                background: 'linear-gradient(90deg, rgba(14, 165, 233, 0.12) 0%, rgba(16, 185, 129, 0.08) 100%)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>👥</span>
                <strong style={{ fontSize: '0.9rem', color: '#38bdf8' }}>
                  {lang === 'tr'
                    ? `Çoklu Farm Aktif (${runningSessions.length} Steam Hesabı Eşzamanlı Çalışıyor)`
                    : `Multi-Instance Active (${runningSessions.length} Steam Accounts Farming in Parallel)`}
                </strong>
              </div>
              <span className="badge badge-green" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                ● {lang === 'tr' ? 'Eşzamanlı Oturumlar' : 'Parallel Sessions'}
              </span>
            </div>
          );
        }
        return null;
      })()}

      {/* Top Counter Stats */}
      <div className="stats-grid">
        <div className="stat-box">
          <span className="stat-label">{t.activeFarming.remainingCards}</span>
          <span className="stat-value highlight">{status.totalCardsRemaining}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">{t.activeFarming.droppedSession}</span>
          <span className="stat-value" style={{ color: 'var(--color-success)' }}>
            +{status.totalCardsDroppedSession}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">{t.activeFarming.droppedAllTime}</span>
          <span className="stat-value" style={{ color: 'var(--neon-cyan)' }}>
            {status.totalCardsDroppedAllTime ?? 0}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">{t.activeFarming.elapsedTime}</span>
          <span className="stat-value">{formatTime(status.sessionElapsedSeconds)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">{t.activeFarming.nextCheck}</span>
          <span className="stat-value" style={{ color: 'var(--neon-cyan)' }}>
            {status.isFarming && !status.isPaused
              ? formatTime(status.nextCheckSecondsRemaining)
              : '--:--'}
          </span>
        </div>
      </div>

      {/* HTTP 429 Rate Limit Banner */}
      {status.pauseReason === 'rate_limit_429' && (
        <div
          className="glass-card"
          style={{
            borderColor: 'var(--color-warning)',
            background: 'rgba(245, 158, 11, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h4 style={{ color: 'var(--color-warning)', marginBottom: '4px' }}>
              ⚠️ {t.activeFarming.rateLimitTitle}
            </h4>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              {t.activeFarming.rateLimitDesc}
            </p>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
            {formatTime(status.rateLimitCountdownSeconds)}
          </div>
        </div>
      )}

      {/* Main Hero Card */}
      <div className="glass-card hero-main-card">
        {status.activeGames.length > 0 && status.activeGames[0].headerImage && (
          <div
            className="hero-backdrop"
            style={{ backgroundImage: `url(${status.activeGames[0].headerImage})` }}
          />
        )}

        <div className="hero-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                <span className="badge badge-cyan" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {status.activePhase === 'warmup_32'
                    ? t.activeFarming.badgeWarmup
                    : status.activePhase === 'solo_drop'
                    ? t.activeFarming.badgeSolo
                    : status.activePhase === 'simultaneous'
                    ? t.activeFarming.badgeSimultaneous
                    : t.activeFarming.badgeIdle}
                </span>

                {status.isFarming && !status.isPaused && (
                  <span className="badge badge-green">
                    {t.activeFarming.badgeSimulating}
                  </span>
                )}

                {/* Idle Mode Selector directly on the Hero Card */}
                {onStrategyChange && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      ⚙️ {t.activeFarming.strategyLabel}
                    </span>
                    <select
                      value={currentStrategy || status.idleStrategy || 'smart_hybrid'}
                      onChange={(e) => onStrategyChange(e.target.value as IdleStrategy)}
                      style={{
                        background: 'rgba(0, 0, 0, 0.65)',
                        border: '1px solid var(--neon-cyan)',
                        color: 'var(--text-primary)',
                        colorScheme: 'dark',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        outline: 'none',
                        backdropFilter: 'blur(8px)',
                        boxShadow: '0 0 10px rgba(0, 242, 254, 0.15)',
                      }}
                      title={t.activeFarming.strategyLabel}
                    >
                      <option value="smart_hybrid" style={{ background: '#10141b', color: '#f0f3f6' }}>{t.activeFarming.strategySmartHybrid}</option>
                      <option value="solo_only" style={{ background: '#10141b', color: '#f0f3f6' }}>{t.activeFarming.strategySoloOnly}</option>
                      <option value="warmup_only" style={{ background: '#10141b', color: '#f0f3f6' }}>{t.activeFarming.strategyWarmupOnly}</option>
                      <option value="simultaneous" style={{ background: '#10141b', color: '#f0f3f6' }}>{t.activeFarming.strategySimultaneous}</option>
                    </select>
                  </div>
                )}
              </div>

              <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '6px' }}>
                {status.activePhase === 'warmup_32'
                  ? `${status.activeGames.length} ${t.activeFarming.titleWarmup}`
                  : status.activePhase === 'simultaneous'
                  ? `${status.activeGames.length} ${t.activeFarming.titleSimultaneous}`
                  : status.activeGames.length > 0
                  ? status.activeGames[0].title
                  : t.activeFarming.titleReady}
              </h2>

              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                {status.activePhase === 'warmup_32'
                  ? t.activeFarming.descWarmup
                  : status.activePhase === 'simultaneous'
                  ? t.activeFarming.descSimultaneous
                  : status.activeGames.length > 0
                  ? `${t.activeFarming.descRemainingCards} ${status.activeGames[0].cardsRemaining} ${t.activeFarming.cardsUnit}`
                  : t.activeFarming.descReady}
              </p>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              {!status.isFarming ? (
                <button
                  className="btn btn-primary"
                  onClick={onStart}
                  disabled={isStarting}
                  style={{ padding: '12px 28px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {isStarting ? (
                    <>
                      <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></span>
                      {t.activeFarming.starting}
                    </>
                  ) : (
                    <>
                      ▶ {t.activeFarming.startFarming}
                    </>
                  )}
                </button>
              ) : (
                <>
                  {status.isPaused ? (
                    <button className="btn btn-success" onClick={onResume}>
                      ▶ {t.activeFarming.resume}
                    </button>
                  ) : (
                    <button className="btn btn-secondary" onClick={onPause}>
                      ⏸ {t.activeFarming.pause}
                    </button>
                  )}
                  <button className="btn btn-danger" onClick={onStop}>
                    ⏹ {t.activeFarming.stop}
                  </button>
                  <button className="btn btn-secondary" onClick={onForceCheck} title={t.activeFarming.checkNowTitle}>
                    🔄 {t.activeFarming.checkNow}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Active Games Thumbnails if in Warm-up or Simultaneous */}
          {(status.activePhase === 'warmup_32' || status.activePhase === 'simultaneous') && status.activeGames.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {t.activeFarming.concurrentGames} ({status.activeGames.length})
                </h4>
                <span style={{ fontSize: '0.75rem', color: 'var(--neon-cyan)', fontWeight: 600 }}>
                  {status.activePhase === 'simultaneous'
                    ? (lang === 'tr' ? '👥 Eşzamanlı Simülasyon' : '👥 Simultaneous Mode')
                    : (lang === 'tr' ? '⚡ Ön Isınma (<2s)' : '⚡ Fast Warm-Up')}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  overflowX: 'auto',
                  paddingBottom: '8px',
                }}
              >
                {status.activeGames.map((g) => (
                  <div
                    key={g.appId}
                    style={{
                      minWidth: '128px',
                      maxWidth: '128px',
                      background: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <img
                      src={g.headerImage}
                      alt={g.title}
                      style={{ width: '100%', height: '58px', objectFit: 'cover' }}
                    />
                    <div style={{ padding: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {g.title}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                        <span style={{ color: 'var(--neon-cyan)', fontSize: '0.7rem' }}>
                          {Math.round(g.playtimeMinutes / 60)} / 2 {t.activeFarming.hrs}
                        </span>
                        <span style={{ color: '#2ecc71', fontSize: '0.7rem', fontWeight: 700 }} title="Kalan Kart">
                          🃏 {g.cardsRemaining}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
