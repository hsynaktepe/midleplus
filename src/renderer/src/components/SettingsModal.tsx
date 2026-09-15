import React, { useState, useEffect } from 'react';
import { AppSettings, PersonaState, AppTheme, FarmingMode, IdleStrategy, Account } from '../../../shared/types';
import { getTranslations } from '../locales/i18n';

interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettings;
  lang: 'tr' | 'en';
  onClose: () => void;
  onSave: (newSettings: Partial<AppSettings>) => void;
  accounts?: Account[];
  activeAccountId?: string | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  lang,
  onClose,
  onSave,
  accounts,
  activeAccountId,
}) => {
  const t = getTranslations(lang);

  // Aktif hesap ve giriş türü kontrolü
  const activeAccount = accounts?.find((a) => a.id === activeAccountId) || accounts?.[0];
  const isCurrentCookie = activeAccount?.loginType === 'cookie';
  const allAccountsCookie = Boolean(accounts && accounts.length > 0 && accounts.every((a) => a.loginType === 'cookie'));
  const isStandaloneDisabled = isCurrentCookie || allAccountsCookie;

  const [selectedTheme, setSelectedTheme] = useState<AppTheme>(settings.theme || 'steam');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(settings.darkMode !== false);
  const [selectedMode, setSelectedMode] = useState<FarmingMode>(
    isStandaloneDisabled ? 'local_client' : (activeAccount?.mode || settings.defaultFarmingMode || 'standalone')
  );
  const [selectedStrategy, setSelectedStrategy] = useState<IdleStrategy>(
    settings.idleStrategy || 'smart_hybrid'
  );

  // Aktif hesap veya isStandaloneDisabled değiştikçe modu senkronize et (çerez hesaptan çıkınca standalone'a geri dön)
  useEffect(() => {
    if (isStandaloneDisabled) {
      setSelectedMode('local_client');
    } else {
      const mode = activeAccount?.mode || settings.defaultFarmingMode || 'standalone';
      setSelectedMode(mode);
    }
  }, [isStandaloneDisabled, activeAccountId, activeAccount?.mode, settings.defaultFarmingMode]);

  // Modal her açıldığında form değerlerini güncel ayarlarla ve aktif hesap moduyla senkronize et
  useEffect(() => {
    if (isOpen) {
      const mode = isStandaloneDisabled ? 'local_client' : (activeAccount?.mode || settings.defaultFarmingMode || 'standalone');
      setSelectedMode(mode);
      setSelectedTheme(settings.theme || 'steam');
      setIsDarkMode(settings.darkMode !== false);
      setSelectedStrategy(settings.idleStrategy || 'smart_hybrid');
      setFilterVac(settings.filterVacGames);
      setAutoPause(settings.autoPauseWhenGameRuns);
      setMinimizeTray(settings.minimizeToTray);
      setPersona(settings.personaState);
      setMultiMin(settings.pollIntervalMultiMinutes);
      setSoloMin(settings.pollIntervalSoloMinutes);
      setBlacklistInput(settings.blacklistAppIds.join(', '));
      setMultiInstance(settings.multiInstanceFarming === true);
      setSelectedCurrency(settings.currencySymbol || '$');
    }
  }, [isOpen]);

  const [filterVac, setFilterVac] = useState(settings.filterVacGames);
  const [autoPause, setAutoPause] = useState(settings.autoPauseWhenGameRuns);
  const [minimizeTray, setMinimizeTray] = useState(settings.minimizeToTray);
  const [persona, setPersona] = useState<PersonaState>(settings.personaState);
  const [multiMin, setMultiMin] = useState(settings.pollIntervalMultiMinutes);
  const [soloMin, setSoloMin] = useState(settings.pollIntervalSoloMinutes);
  const [blacklistInput, setBlacklistInput] = useState(settings.blacklistAppIds.join(', '));
  const [multiInstance, setMultiInstance] = useState(settings.multiInstanceFarming === true);
  const [selectedCurrency, setSelectedCurrency] = useState<string>(settings.currencySymbol || '$');

  const handleSave = async () => {
    const parsedBlacklist = blacklistInput
      .split(',')
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n));

    if (activeAccountId && selectedMode) {
      await window.api?.setAccountMode?.(activeAccountId, selectedMode);
    }

    const currencyMap: Record<string, { code: number; symbol: string }> = {
      '$': { code: 1, symbol: '$' },
      '€': { code: 3, symbol: '€' },
      '£': { code: 2, symbol: '£' },
      '₺': { code: 17, symbol: '₺' },
      '₽': { code: 5, symbol: '₽' },
      'R$': { code: 7, symbol: 'R$' },
    };
    const mapped = currencyMap[selectedCurrency] || { code: 1, symbol: '$' };

    onSave({
      theme: selectedTheme,
      darkMode: isDarkMode,
      defaultFarmingMode: selectedMode,
      idleStrategy: selectedStrategy,
      filterVacGames: filterVac,
      autoPauseWhenGameRuns: autoPause,
      minimizeToTray: minimizeTray,
      personaState: persona,
      pollIntervalMultiMinutes: multiMin,
      pollIntervalSoloMinutes: soloMin,
      blacklistAppIds: parsedBlacklist,
      multiInstanceFarming: multiInstance,
      currencyCode: mapped.code,
      currencySymbol: mapped.symbol,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '580px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
            ⚙️ {t.settings.title}
          </h3>
          <button className="win-btn close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px' }}>
          {/* Appearance & Themes Section */}
          <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid var(--border-subtle)' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--border-accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🎨 {t.settings.appearanceSection}
            </h4>

            {/* Theme selector */}
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                {t.settings.themeSelect}
              </label>
              <div className="theme-options-grid">
                {/* Steam Theme Option */}
                <div
                  className={`theme-card-option ${selectedTheme === 'steam' ? 'active' : ''}`}
                  onClick={() => setSelectedTheme('steam')}
                >
                  <div className="theme-preview-pill" style={{ background: '#171d25', border: '1px solid #2a475e' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#75b022' }} />
                    <div style={{ width: '22px', height: '6px', borderRadius: '2px', background: '#66c0f4' }} />
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    {t.settings.themeSteamTitle}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {t.settings.themeSteamDesc}
                  </div>
                </div>

                {/* Cyber Neon Theme Option */}
                <div
                  className={`theme-card-option ${selectedTheme === 'neon' ? 'active' : ''}`}
                  onClick={() => setSelectedTheme('neon')}
                >
                  <div className="theme-preview-pill" style={{ background: '#0e111f', border: '1px solid rgba(0,242,254,0.4)' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#00f2fe', boxShadow: '0 0 6px #00f2fe' }} />
                    <div style={{ width: '22px', height: '6px', borderRadius: '2px', background: '#4facfe' }} />
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    {t.settings.themeNeonTitle}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {t.settings.themeNeonDesc}
                  </div>
                </div>

                {/* Midnight Nebula Theme Option */}
                <div
                  className={`theme-card-option ${selectedTheme === 'midnight' ? 'active' : ''}`}
                  onClick={() => setSelectedTheme('midnight')}
                >
                  <div className="theme-preview-pill" style={{ background: '#16102e', border: '1px solid rgba(168,85,247,0.4)' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#a855f7', boxShadow: '0 0 6px #ec4899' }} />
                    <div style={{ width: '22px', height: '6px', borderRadius: '2px', background: '#ec4899' }} />
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    {t.settings.themeMidnightTitle}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {t.settings.themeMidnightDesc}
                  </div>
                </div>
              </div>
            </div>

            {/* Dark / Light Mode Selector */}
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                {t.settings.modeSelect}
              </label>
              <div className="mode-selector">
                <button
                  type="button"
                  className={`mode-option-btn ${isDarkMode ? 'active' : ''}`}
                  onClick={() => setIsDarkMode(true)}
                >
                  🌙 {t.settings.modeDark}
                </button>
                <button
                  type="button"
                  className={`mode-option-btn ${!isDarkMode ? 'active' : ''}`}
                  onClick={() => setIsDarkMode(false)}
                >
                  ☀️ {t.settings.modeLight}
                </button>
              </div>
            </div>

            {/* Currency Preference Selector (Wallet-Free) */}
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                💰 {t.settings.currencySelect}
              </label>
              <select
                className="input-field"
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '0.85rem',
                  borderRadius: '6px',
                  background: isDarkMode ? 'var(--bg-tertiary, #1b2838)' : '#ffffff',
                  border: isDarkMode ? '1px solid var(--border-subtle)' : '1px solid #cbd5e1',
                  color: isDarkMode ? 'var(--text-primary, #f0f3f6)' : '#0f172a',
                  colorScheme: isDarkMode ? 'dark' : 'light',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="$" style={{ background: isDarkMode ? '#171d25' : '#ffffff', color: isDarkMode ? '#f0f3f6' : '#0f172a' }}>{t.settings.currencyUsd}</option>
                <option value="€" style={{ background: isDarkMode ? '#171d25' : '#ffffff', color: isDarkMode ? '#f0f3f6' : '#0f172a' }}>{t.settings.currencyEur}</option>
                <option value="₺" style={{ background: isDarkMode ? '#171d25' : '#ffffff', color: isDarkMode ? '#f0f3f6' : '#0f172a' }}>{t.settings.currencyTry}</option>
                <option value="£" style={{ background: isDarkMode ? '#171d25' : '#ffffff', color: isDarkMode ? '#f0f3f6' : '#0f172a' }}>{t.settings.currencyGbp}</option>
                <option value="₽" style={{ background: isDarkMode ? '#171d25' : '#ffffff', color: isDarkMode ? '#f0f3f6' : '#0f172a' }}>{t.settings.currencyRub}</option>
                <option value="R$" style={{ background: isDarkMode ? '#171d25' : '#ffffff', color: isDarkMode ? '#f0f3f6' : '#0f172a' }}>{t.settings.currencyBrl}</option>
              </select>
            </div>
          </div>

          {/* Default Farming Mode Section */}
          <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid var(--border-subtle)' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--border-accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ⚡ {t.settings.defaultModeSection}
            </h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {t.settings.defaultModeDesc}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {/* Standalone Option */}
              <div
                className={`theme-card-option ${selectedMode === 'standalone' ? 'active' : ''}`}
                onClick={() => {
                  if (!isStandaloneDisabled) {
                    setSelectedMode('standalone');
                  }
                }}
                style={{
                  padding: '12px',
                  cursor: isStandaloneDisabled ? 'not-allowed' : 'pointer',
                  opacity: isStandaloneDisabled ? 0.42 : 1,
                  filter: isStandaloneDisabled ? 'grayscale(0.6)' : 'none',
                  border: isStandaloneDisabled ? '1px dashed rgba(255,255,255,0.15)' : undefined,
                  position: 'relative',
                }}
                title={isStandaloneDisabled ? t.settings.modeCookieDisabledTooltip : undefined}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }}>🚀</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                      {t.settings.modeStandaloneTitle}
                    </div>
                    {isStandaloneDisabled ? (
                      <span
                        className="badge"
                        style={{
                          fontSize: '0.65rem',
                          padding: '1px 5px',
                          marginTop: '2px',
                          background: 'rgba(239, 68, 68, 0.18)',
                          color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          fontWeight: 700,
                        }}
                      >
                        {t.settings.modeCookieDisabledBadge}
                      </span>
                    ) : (
                      <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '1px 5px', marginTop: '2px' }}>
                        {t.settings.modeStandaloneBadge}
                      </span>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.35 }}>
                  {isStandaloneDisabled
                    ? t.settings.modeCookieDisabledTooltip
                    : t.settings.modeStandaloneDesc}
                </p>
              </div>

              {/* Local Client Option */}
              <div
                className={`theme-card-option ${selectedMode === 'local_client' ? 'active' : ''}`}
                onClick={() => setSelectedMode('local_client')}
                style={{ padding: '12px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }}>🖥️</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                      {t.settings.modeLocalTitle}
                    </div>
                    <span className="badge badge-gold" style={{ fontSize: '0.65rem', padding: '1px 5px', marginTop: '2px' }}>
                      {t.settings.modeLocalBadge}
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.35 }}>
                  {t.settings.modeLocalDesc}
                </p>
              </div>
            </div>

            {/* Aktif hesap ve giriş türü bilgi notu */}
            {activeAccount && (
              <div
                style={{
                  fontSize: '0.74rem',
                  padding: '7px 11px',
                  borderRadius: '6px',
                  background: isCurrentCookie ? 'rgba(245, 158, 11, 0.12)' : 'rgba(102, 192, 244, 0.08)',
                  border: isCurrentCookie ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(102, 192, 244, 0.2)',
                  color: isCurrentCookie ? '#f59e0b' : 'var(--border-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  lineHeight: 1.4,
                }}
              >
                <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>{isCurrentCookie ? '⚠️' : '💡'}</span>
                <span>
                  {t.settings.modeActiveAccountNote
                    .replace('{name}', activeAccount.accountName)
                    .replace('{type}', isCurrentCookie ? t.settings.loginTypeCookie : t.settings.loginTypeQr)}
                  {isCurrentCookie && ` — ${t.settings.modeCookieDisabledBadge}`}
                </span>
              </div>
            )}
          </div>

          {/* Idle Strategy Section */}
          <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid var(--border-subtle)' }}>
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--border-accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🎮 {t.settings.strategySection}
              </h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {t.settings.strategyDesc}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {/* Smart Hybrid */}
              <div
                className={`theme-card-option ${selectedStrategy === 'smart_hybrid' ? 'active' : ''}`}
                onClick={() => setSelectedStrategy('smart_hybrid')}
                style={{ cursor: 'pointer', padding: '12px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '1rem' }}>🚀</span>
                  <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 700 }}>
                    {t.settings.strategySmartHybridBadge}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {t.settings.strategySmartHybridTitle}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                  {t.settings.strategySmartHybridDesc}
                </div>
              </div>

              {/* Solo Only */}
              <div
                className={`theme-card-option ${selectedStrategy === 'solo_only' ? 'active' : ''}`}
                onClick={() => setSelectedStrategy('solo_only')}
                style={{ cursor: 'pointer', padding: '12px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '1rem' }}>🎯</span>
                  <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', fontWeight: 700 }}>
                    {t.settings.strategySoloOnlyBadge}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {t.settings.strategySoloOnlyTitle}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                  {t.settings.strategySoloOnlyDesc}
                </div>
              </div>

              {/* Warm-Up Only */}
              <div
                className={`theme-card-option ${selectedStrategy === 'warmup_only' ? 'active' : ''}`}
                onClick={() => setSelectedStrategy('warmup_only')}
                style={{ cursor: 'pointer', padding: '12px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '1rem' }}>⚡</span>
                  <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', fontWeight: 700 }}>
                    {t.settings.strategyWarmupOnlyBadge}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {t.settings.strategyWarmupOnlyTitle}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                  {t.settings.strategyWarmupOnlyDesc}
                </div>
              </div>

              {/* Simultaneous */}
              <div
                className={`theme-card-option ${selectedStrategy === 'simultaneous' ? 'active' : ''}`}
                onClick={() => setSelectedStrategy('simultaneous')}
                style={{ cursor: 'pointer', padding: '12px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '1rem' }}>👥</span>
                  <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', fontWeight: 700 }}>
                    {t.settings.strategySimultaneousBadge}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {t.settings.strategySimultaneousTitle}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                  {t.settings.strategySimultaneousDesc}
                </div>
              </div>
            </div>
          </div>

          {/* Security & VAC */}
          <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '12px', color: 'var(--border-accent)' }}>
              🛡️ {t.settings.securitySection}
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filterVac}
                  onChange={(e) => setFilterVac(e.target.checked)}
                />
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                    {t.settings.filterVacLabel}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {t.settings.filterVacDesc}
                  </div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoPause}
                  onChange={(e) => setAutoPause(e.target.checked)}
                />
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                    {t.settings.autoPauseLabel}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {t.settings.autoPauseDesc}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Steam Privacy */}
          <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '12px', color: 'var(--border-accent)' }}>
              👤 {t.settings.privacySection}
            </h4>

            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                {t.settings.personaLabel}
              </label>
              <select
                value={persona}
                onChange={(e) => setPersona(e.target.value as any)}
                style={{
                  width: '100%',
                  background: isDarkMode ? 'var(--bg-tertiary, #1b2838)' : '#ffffff',
                  border: isDarkMode ? '1px solid var(--border-subtle)' : '1px solid #cbd5e1',
                  color: isDarkMode ? 'var(--text-primary, #f0f3f6)' : '#0f172a',
                  colorScheme: isDarkMode ? 'dark' : 'light',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="online" style={{ background: isDarkMode ? '#171d25' : '#ffffff', color: isDarkMode ? '#f0f3f6' : '#0f172a' }}>{t.settings.personaOnline}</option>
                <option value="silent_online" style={{ background: isDarkMode ? '#171d25' : '#ffffff', color: isDarkMode ? '#f0f3f6' : '#0f172a' }}>{t.settings.personaSilentOnline}</option>
                <option value="invisible" style={{ background: isDarkMode ? '#171d25' : '#ffffff', color: isDarkMode ? '#f0f3f6' : '#0f172a' }}>{t.settings.personaInvisible}</option>
                <option value="offline" style={{ background: isDarkMode ? '#171d25' : '#ffffff', color: isDarkMode ? '#f0f3f6' : '#0f172a' }}>{t.settings.personaOffline}</option>
              </select>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.4' }}>
                {t.settings.personaTip}
              </div>
              {isCurrentCookie && (persona === 'online' || persona === 'silent_online') && (
                <div
                  style={{
                    marginTop: '8px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'rgba(234, 179, 8, 0.12)',
                    border: '1px solid rgba(234, 179, 8, 0.35)',
                    color: '#facc15',
                    fontSize: '0.75rem',
                    lineHeight: 1.4,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '6px',
                  }}
                >
                  <span style={{ fontSize: '0.85rem' }}>⚠️</span>
                  <span>{t.settings.cookiePersonaWarn}</span>
                </div>
              )}
            </div>
          </div>

          {/* Rate Limiting & Timers */}
          <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '12px', color: 'var(--border-accent)' }}>
              ⏱️ {t.settings.timersSection}
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  {t.settings.multiIntervalLabel}
                </label>
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={multiMin}
                  onChange={(e) => setMultiMin(parseInt(e.target.value) || 15)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    padding: '8px',
                    borderRadius: '6px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  {t.settings.soloIntervalLabel}
                </label>
                <input
                  type="number"
                  min="2"
                  max="30"
                  value={soloMin}
                  onChange={(e) => setSoloMin(parseInt(e.target.value) || 5)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    padding: '8px',
                    borderRadius: '6px',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Multi-Instance Simultaneous Farming */}
          <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--border-accent)' }}>
              👥 {t.settings.multiInstanceSection}
            </h4>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginTop: '4px' }}>
              <input
                type="checkbox"
                checked={multiInstance}
                onChange={(e) => setMultiInstance(e.target.checked)}
                style={{ marginTop: '3px', accentColor: 'var(--border-accent)', width: '16px', height: '16px' }}
              />
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t.settings.multiInstanceLabel}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {t.settings.multiInstanceDesc}
                </div>
              </div>
            </label>
          </div>

          {/* Blacklist */}
          <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '6px', color: 'var(--border-accent)' }}>
              🚫 {t.settings.blacklistSection}
            </h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              {t.settings.blacklistDesc}
            </p>
            <input
              type="text"
              value={blacklistInput}
              onChange={(e) => setBlacklistInput(e.target.value)}
              placeholder="730, 440, 570"
              style={{
                width: '100%',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                padding: '8px 12px',
                borderRadius: '6px',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>

          {/* General */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 2px' }}>
            <input
              type="checkbox"
              id="trayCheck"
              checked={minimizeTray}
              onChange={(e) => setMinimizeTray(e.target.checked)}
            />
            <label htmlFor="trayCheck" style={{ fontSize: '0.88rem', cursor: 'pointer' }}>
              {t.settings.trayLabel}
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            {t.settings.cancel}
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            💾 {t.settings.saveSettings}
          </button>
        </div>
      </div>
    </div>
  );
};
