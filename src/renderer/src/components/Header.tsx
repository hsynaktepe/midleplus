import React from 'react';
import { Account, FarmingStatus, PersonaState } from '../../../shared/types';
import { getTranslations } from '../locales/i18n';
import { Logo } from './Logo';

interface HeaderProps {
  activeAccount: Account | null;
  accounts?: Account[];
  status: FarmingStatus;
  lang: 'tr' | 'en';
  personaState?: PersonaState;
  onToggleLang: () => void;
  onOpenAccounts: () => void;
  onSelectAccount?: (accountId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeAccount,
  accounts = [],
  status,
  lang,
  personaState,
  onToggleLang,
  onOpenAccounts,
  onSelectAccount,
}) => {
  const t = getTranslations(lang);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  const handleMin = () => window.api?.minimizeWindow();
  const handleMax = () => window.api?.maximizeWindow();
  const handleClose = () => window.api?.closeWindow();

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <div className="app-logo" title={`${t.app.title} (${(t.app as any).shortTitle || 'Midle+'})`}>
          <Logo size={20} />
          <span>{(t.app as any).shortTitle || 'Midle+'}</span>
          <span className="app-logo-badge">{t.app.version}</span>
        </div>

        {activeAccount ? (
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              style={{
                padding: '4px 10px',
                fontSize: '0.8rem',
                gap: '8px',
                borderRadius: '4px',
                cursor: 'pointer',
                borderColor: isDropdownOpen ? 'var(--steam-blue, #66c0f4)' : undefined,
                boxShadow: isDropdownOpen ? '0 0 8px rgba(102, 192, 244, 0.4)' : undefined,
              }}
              title={t.header.quickSwitchTitle}
            >
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  background: status.isFarming ? 'var(--color-success)' : 'var(--steam-cyan)',
                  boxShadow: status.isFarming ? '0 0 8px rgba(164, 208, 7, 0.6)' : '0 0 8px rgba(102, 192, 244, 0.6)',
                }}
              />
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{activeAccount.accountName}</span>
              <span style={{ opacity: 0.6, fontSize: '0.72rem' }}>
                ({activeAccount.mode === 'local_client' ? t.header.steamClient : t.header.standalone})
              </span>

              {personaState && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '2px 7px',
                    borderRadius: '12px',
                    fontWeight: 600,
                    marginLeft: '2px',
                    background:
                      personaState === 'online'
                        ? 'rgba(164, 208, 7, 0.18)'
                        : personaState === 'silent_online'
                        ? 'rgba(56, 189, 248, 0.18)'
                        : personaState === 'invisible'
                        ? 'rgba(102, 192, 244, 0.18)'
                        : 'rgba(255, 255, 255, 0.08)',
                    color:
                      personaState === 'online'
                        ? '#a4d007'
                        : personaState === 'silent_online'
                        ? '#38bdf8'
                        : personaState === 'invisible'
                        ? '#66c0f4'
                        : 'var(--text-muted)',
                    border: `1px solid ${
                      personaState === 'online'
                        ? 'rgba(164, 208, 7, 0.4)'
                        : personaState === 'silent_online'
                        ? 'rgba(56, 189, 248, 0.45)'
                        : personaState === 'invisible'
                        ? 'rgba(102, 192, 244, 0.4)'
                        : 'rgba(255, 255, 255, 0.15)'
                    }`,
                  }}
                  title={
                    personaState === 'online'
                      ? t.header.onlineTitle
                      : personaState === 'silent_online'
                      ? t.header.silentOnlineTitle
                      : personaState === 'invisible'
                      ? t.header.invisibleTitle
                      : t.header.offlineTitle
                  }
                >
                  {personaState === 'online'
                    ? t.header.statusOnline
                    : personaState === 'silent_online'
                    ? t.header.statusSilentOnline
                    : personaState === 'invisible'
                    ? t.header.statusInvisible
                    : t.header.statusOffline}
                </span>
              )}

              <span
                style={{
                  fontSize: '0.65rem',
                  opacity: 0.7,
                  marginLeft: '2px',
                  transform: isDropdownOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.18s ease',
                  display: 'inline-block',
                }}
              >
                ▼
              </span>
            </button>

            {/* Quick Switch Dropdown Popover */}
            {isDropdownOpen && (
              <div className="account-quick-dropdown">
                {/* Header */}
                <div
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    padding: '4px 8px 6px 8px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>👤 {t.header.switchAccount}</span>
                  <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>({accounts.length})</span>
                </div>

                {/* Account list */}
                <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {accounts.map((acc) => {
                    const isCurrent = acc.id === activeAccount.id;
                    return (
                      <div
                        key={acc.id}
                        className={`account-quick-item ${isCurrent ? 'active' : ''}`}
                        onClick={() => {
                          if (!isCurrent && onSelectAccount) {
                            onSelectAccount(acc.id);
                          }
                          setIsDropdownOpen(false);
                        }}
                      >
                        {/* Avatar */}
                        {acc.avatarUrl ? (
                          <img
                            src={acc.avatarUrl}
                            alt=""
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '4px',
                              border: isCurrent ? '1px solid var(--steam-cyan)' : '1px solid rgba(255,255,255,0.1)',
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '4px',
                              background: 'rgba(255, 255, 255, 0.08)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.9rem',
                              flexShrink: 0,
                            }}
                          >
                            🎮
                          </div>
                        )}

                        {/* Details */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                fontWeight: isCurrent ? 700 : 600,
                                fontSize: '0.82rem',
                                color: isCurrent ? '#00d1ff' : 'var(--text-primary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {acc.accountName}
                            </span>
                            {acc.isMaster && <span style={{ fontSize: '0.7rem' }}>👑</span>}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {acc.mode === 'standalone' ? `🚀 ${t.accounts.standaloneBadge}` : `🖥️ ${t.accounts.localClientBadge}`}
                          </div>
                        </div>

                        {/* Active Indicator */}
                        {isCurrent && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              color: 'var(--color-success)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            ✓
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Footer Divider & Manage Accounts Action */}
                <div
                  style={{
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    paddingTop: '6px',
                    marginTop: '2px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onOpenAccounts();
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      color: 'var(--steam-blue, #66c0f4)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(0, 180, 216, 0.12)';
                      e.currentTarget.style.borderColor = 'rgba(0, 180, 216, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                    }}
                  >
                    <span>⚙️</span>
                    <span>{t.header.addOrManageAccounts}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            className="btn btn-primary"
            onClick={onOpenAccounts}
            style={{ padding: '4px 12px', fontSize: '0.8rem' }}
          >
            + {t.header.connectAccount}
          </button>
        )}
      </div>

      <div className="titlebar-center">
        {status.isFarming && (
          <div className="badge badge-cyan" style={{ animation: 'pulse 2s infinite' }}>
            ● {status.activePhase === 'warmup_32'
              ? t.header.phaseWarmup
              : status.activePhase === 'simultaneous'
              ? t.activeFarming.badgeSimultaneous
              : t.header.phaseSolo}
          </div>
        )}
        {status.isPaused && (
          <div className="badge badge-gold">
            ⏸ {status.pauseReason === 'in_game' ? t.header.pausedInGame : t.header.paused}
          </div>
        )}
      </div>

      <div className="titlebar-right">
        <button
          className="win-btn"
          onClick={onToggleLang}
          title={t.header.switchLang}
          style={{ fontSize: '0.8rem', fontWeight: 700 }}
        >
          {lang.toUpperCase()}
        </button>

        <button className="win-btn" onClick={handleMin} title={t.header.minimize}>
          —
        </button>
        <button className="win-btn" onClick={handleMax} title={t.header.maximize}>
          ◻
        </button>
        <button className="win-btn close" onClick={handleClose} title={t.header.close}>
          ✕
        </button>
      </div>
    </header>
  );
};
