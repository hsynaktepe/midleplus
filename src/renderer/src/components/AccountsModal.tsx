import React, { useState, useEffect } from 'react';
import { Account, QRAuthSession, FarmingMode, FarmingStatus } from '../../../shared/types';
import { getTranslations } from '../locales/i18n';
import { ConfirmModal } from './ConfirmModal';

interface AccountsModalProps {
  isOpen: boolean;
  accounts: Account[];
  farmingStatus?: FarmingStatus;
  lang: 'tr' | 'en';
  onClose: () => void;
  onRefreshAccounts: () => void;
  onSelectAccount: (accountId: string) => void;
}

export const AccountsModal: React.FC<AccountsModalProps> = ({
  isOpen,
  accounts,
  farmingStatus,
  lang,
  onClose,
  onRefreshAccounts,
  onSelectAccount,
}) => {
  const t = getTranslations(lang);
  const [activeTab, setActiveTab] = useState<'list' | 'qr' | 'cookie'>('list');
  const [qrSession, setQrSession] = useState<QRAuthSession | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  // Cookie form state
  const [sessionId, setSessionId] = useState('');
  const [steamLoginSecure, setSteamLoginSecure] = useState('');
  const [cookieAccountName, setCookieAccountName] = useState('');
  const [cookieError, setCookieError] = useState('');
  const [cookieLoading, setCookieLoading] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);

  useEffect(() => {
    if (activeTab === 'qr' && accounts.length > 0) {
      setActiveTab('list');
      setQrSession(null);
    }
  }, [accounts]);

  const handleStartQR = async () => {
    setActiveTab('qr');
    setQrLoading(true);
    try {
      const session = await window.api?.startQRAuth();
      if (session) {
        setQrSession(session);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setQrLoading(false);
    }
  };

  const formatCookieError = (err: string) => {
    if (!err) return '';
    if (lang === 'tr') return err;

    if (err.includes('Steam oturumu doğrulanamadı') || err.includes('Girdiğiniz çerezlerin süresi dolmuş')) {
      return t.accounts.errorExpired;
    }
    if (err.includes('Geçersiz steamLoginSecure') || err.includes('SteamID64')) {
      return t.accounts.errorInvalidFormat;
    }
    if (err.includes('zaman aşımı')) {
      return t.accounts.errorTimeout;
    }
    if (err.includes('Steam oturum kontrol hatası')) {
      return `${t.accounts.errorSessionCheck} ${err.split(': ')[1] || ''}`;
    }
    if (err.includes('Çerezler yüklenemedi')) {
      return `${t.accounts.errorFailedCookies} ${err.split(': ')[1] || ''}`;
    }
    if (err.includes('Lütfen hem sessionid')) {
      return t.accounts.errorEmptyCookies;
    }
    return err;
  };

  const handleCookieLogin = async () => {
    if (!sessionId.trim() || !steamLoginSecure.trim()) {
      setCookieError(t.accounts.errorEmptyCookies);
      return;
    }
    setCookieError('');
    setCookieLoading(true);
    try {
      const res = await window.api?.loginWithCookie(sessionId, steamLoginSecure, cookieAccountName);
      if (res?.success) {
        setSessionId('');
        setSteamLoginSecure('');
        setCookieAccountName('');
        setActiveTab('list');
        onRefreshAccounts();
      } else {
        const errorMsg = lang === 'tr'
          ? (res?.error || t.accounts.errorGenericVerification)
          : (res?.error ? formatCookieError(res.error) : t.accounts.errorGenericVerification);
        setCookieError(errorMsg);
      }
    } catch (e: any) {
      setCookieError(e?.message || t.accounts.connectionError);
    } finally {
      setCookieLoading(false);
    }
  };

  const handleSetMaster = async (id: string) => {
    await window.api?.setMasterAccount(id);
    onRefreshAccounts();
  };

  const handleToggleMode = async (id: string, currentMode: FarmingMode, loginType: string) => {
    // Cookie hesapları CM token'ı olmadığı için sadece local_client modunda kalabilir
    if (loginType === 'cookie') return;

    const nextMode: FarmingMode = currentMode === 'standalone' ? 'local_client' : 'standalone';
    await window.api?.setAccountMode(id, nextMode);
    onRefreshAccounts();
  };

  // Hesabın loginType'ına göre mod değiştirme izni var mı?
  const canToggleMode = (acc: Account): boolean => {
    // Cookie hesapları sadece local_client destekler
    if (acc.loginType === 'cookie') return false;
    // QR ve Şifreli hesaplar hem Standalone hem Local Client moduna geçebilir
    return true;
  };

  const handleConfirmRemove = async () => {
    if (!accountToDelete) return;
    const id = accountToDelete.id;
    setAccountToDelete(null);
    await window.api?.removeAccount(id);
    onRefreshAccounts();
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
          width: '630px',
          maxWidth: '92vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
            {t.accounts.title}
          </h3>
          <button className="win-btn close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Inner Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            className={`btn ${activeTab === 'list' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('list')}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            {t.accounts.connectedAccounts} ({accounts.length})
          </button>
          <button
            className={`btn ${activeTab === 'qr' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={handleStartQR}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            📱 {t.accounts.steamMobileQr}
          </button>
          <button
            className={`btn ${activeTab === 'cookie' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('cookie')}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            🍪 {t.accounts.cookieLoginTab}
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: '300px' }}>
          {activeTab === 'list' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {accounts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)' }}>
                  <p style={{ marginBottom: '12px' }}>
                    {t.accounts.noAccounts}
                  </p>
                  <button className="btn btn-primary" onClick={handleStartQR}>
                    📱 {t.accounts.addFirstQr}
                  </button>
                </div>
              ) : (
                accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="glass-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      gap: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                      {acc.avatarUrl ? (
                        <img
                          src={acc.avatarUrl}
                          alt={acc.accountName}
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '6px',
                            objectFit: 'cover',
                            border: '1px solid var(--border-accent)',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '6px',
                            background: 'var(--bg-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.2rem',
                            border: '1px solid var(--border-subtle)',
                            flexShrink: 0,
                          }}
                        >
                          🎮
                        </div>
                      )}

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                            {acc.accountName}
                          </span>
                          {acc.isMaster && <span className="badge badge-gold">{t.accounts.masterBadge}</span>}
                          {acc.mode === 'standalone' ? (
                            <span className="badge badge-cyan" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                              🚀 {t.accounts.standaloneBadge}
                            </span>
                          ) : (
                            <span className="badge badge-gold" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                              🖥️ {t.accounts.localClientBadge}
                            </span>
                          )}
                          {!canToggleMode(acc) && (
                            <span
                              style={{
                                fontSize: '0.66rem',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-muted)',
                              }}
                              title={acc.loginType === 'cookie' ? t.accounts.modeLockedCookie : t.accounts.modeLockedQR}
                            >
                              🔒 {acc.loginType === 'cookie' ? 'Cookie' : 'QR'}
                            </span>
                          )}
                          {(() => {
                            const accStatus = farmingStatus?.multiStatus?.[acc.id];
                            if (accStatus?.isFarming) {
                              return (
                                <span
                                  style={{
                                    fontSize: '0.68rem',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    background: 'rgba(34, 197, 94, 0.2)',
                                    border: '1px solid #22c55e',
                                    color: '#4ade80',
                                    fontWeight: 700,
                                  }}
                                >
                                  🌾 {lang === 'tr' ? 'Farm Ediyor' : 'Farming'} ({accStatus.totalCardsRemaining} {lang === 'tr' ? 'Kart' : 'Cards'})
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>

                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.35 }}>
                          {acc.mode === 'standalone'
                            ? t.accounts.standaloneDesc
                            : t.accounts.localClientDesc}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                      {(() => {
                        const accStatus = farmingStatus?.multiStatus?.[acc.id];
                        const isFarming = accStatus?.isFarming;
                        return isFarming ? (
                          <button
                            className="btn btn-secondary"
                            onClick={async () => {
                              await window.api?.stopFarmingAccount?.(acc.id);
                              onRefreshAccounts();
                            }}
                            style={{ padding: '6px 10px', fontSize: '0.75rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
                            title={lang === 'tr' ? 'Bu hesabın kart düşürmesini durdur' : 'Stop farming on this account'}
                          >
                            ⏹ {lang === 'tr' ? 'Durdur' : 'Stop'}
                          </button>
                        ) : (
                          <button
                            className="btn btn-secondary"
                            onClick={async () => {
                              await window.api?.startFarmingAccount?.(acc.id);
                              onRefreshAccounts();
                            }}
                            style={{ padding: '6px 10px', fontSize: '0.75rem', borderColor: 'rgba(74, 222, 128, 0.4)', color: '#86efac' }}
                            title={lang === 'tr' ? 'Bu hesapta bağımsız kart düşürme başlat' : 'Start farming on this account'}
                          >
                            🌾 {lang === 'tr' ? 'Farm Başlat' : 'Farm'}
                          </button>
                        );
                      })()}
                      {canToggleMode(acc) && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleToggleMode(acc.id, acc.mode, acc.loginType)}
                          style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                          title={
                            acc.mode === 'standalone'
                              ? t.accounts.toLocalTitle
                              : t.accounts.toStandaloneTitle
                          }
                        >
                          🔄 {acc.mode === 'standalone' ? t.accounts.toLocalBtn : t.accounts.toStandaloneBtn}
                        </button>
                      )}

                      {!acc.isMaster && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleSetMaster(acc.id)}
                          style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                          title={t.accounts.setMasterTitle}
                        >
                          👑 {t.accounts.masterBtn}
                        </button>
                      )}

                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          onSelectAccount(acc.id);
                          onClose();
                        }}
                        style={{ padding: '6px 14px', fontSize: '0.78rem', fontWeight: 600 }}
                      >
                        {t.accounts.select}
                      </button>

                      <button
                        className="win-btn close"
                        onClick={() => setAccountToDelete(acc)}
                        title={t.accounts.removeAccountTitle}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}

              {/* Mode Explanation Guide Box */}
              {accounts.length > 0 && (
                <div
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    marginTop: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--border-accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    💡 {t.accounts.modesGuideTitle}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    <p style={{ marginBottom: '4px' }}>
                      <strong style={{ color: 'var(--border-accent)' }}>{t.accounts.modesGuideStandaloneTitle}</strong>{' '}
                      {t.accounts.modesGuideStandaloneDesc}
                    </p>
                    <p>
                      <strong style={{ color: 'var(--color-gold)' }}>{t.accounts.modesGuideLocalTitle}</strong>{' '}
                      {t.accounts.modesGuideLocalDesc}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'qr' && (
            <div style={{ textAlign: 'center', padding: '16px' }}>
              {qrLoading ? (
                <div style={{ padding: '40px' }}>{t.accounts.qrGenerating}</div>
              ) : qrSession ? (
                <div>
                  <div
                    style={{
                      background: '#0b0e14',
                      padding: '16px',
                      borderRadius: '16px',
                      display: 'inline-block',
                      border: '2px solid var(--neon-cyan)',
                      boxShadow: 'var(--shadow-glow-cyan)',
                      marginBottom: '16px',
                    }}
                  >
                    <img src={qrSession.qrCodeDataUrl} alt="Steam QR Code" style={{ width: '240px', height: '240px' }} />
                  </div>
                  <h4 style={{ fontWeight: 700, marginBottom: '6px' }}>
                    {t.accounts.qrScanTitle}
                  </h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '360px', margin: '0 auto' }}>
                    {t.accounts.qrScanDesc}
                  </p>
                </div>
              ) : (
                <button className="btn btn-primary" onClick={handleStartQR}>
                  {t.accounts.generateNewQr}
                </button>
              )}

              <div
                style={{
                  background: 'rgba(0, 242, 254, 0.04)',
                  border: '1px solid rgba(0, 242, 254, 0.2)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  marginTop: '16px',
                  textAlign: 'left',
                  fontSize: '0.76rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--neon-cyan)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ℹ️ {t.accounts.qrSecurityNoteTitle}
                </div>
                <div>{t.accounts.qrSecurityNoteDesc}</div>
              </div>
            </div>
          )}

          {activeTab === 'cookie' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '10px 0' }}>
              <div
                style={{
                  background: 'rgba(0, 255, 136, 0.06)',
                  border: '1px solid rgba(0, 255, 136, 0.25)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                }}
              >
                <strong style={{ color: '#00ff88' }}>{t.accounts.cookieSecurityBadge}</strong>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {t.accounts.cookieInstructions}
              </p>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  {t.accounts.accountNameLabel}
                </label>
                <input
                  type="text"
                  value={cookieAccountName}
                  onChange={(e) => setCookieAccountName(e.target.value)}
                  placeholder={t.accounts.accountNamePlaceholder}
                  style={{
                    width: '100%',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    color: '#fff',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  sessionid
                </label>
                <input
                  type="text"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  placeholder={t.accounts.sessionIdPlaceholder}
                  style={{
                    width: '100%',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    color: '#fff',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  steamLoginSecure
                </label>
                <input
                  type="password"
                  value={steamLoginSecure}
                  onChange={(e) => setSteamLoginSecure(e.target.value)}
                  placeholder="76561198...||..."
                  style={{
                    width: '100%',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    color: '#fff',
                  }}
                />
              </div>

              {cookieError && (
                <div
                  style={{
                    background: 'rgba(205, 58, 58, 0.15)',
                    border: '1px solid var(--color-danger)',
                    borderRadius: '6px',
                    padding: '10px 14px',
                    color: '#ff8585',
                    fontSize: '0.85rem',
                    lineHeight: 1.4,
                  }}
                >
                  ⚠️ {formatCookieError(cookieError)}
                </div>
              )}

              <button
                className="btn btn-primary"
                onClick={handleCookieLogin}
                disabled={cookieLoading}
                style={{
                  minHeight: '38px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {cookieLoading ? (
                  <>
                    <span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                    {t.accounts.verifying}
                  </>
                ) : (
                  <>
                    🔒 {t.accounts.verifyAndConnect}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modern Hesap Kaldırma Onay Modalı */}
      <ConfirmModal
        isOpen={Boolean(accountToDelete)}
        title={t.accounts.removeAccountModalTitle || t.accounts.removeAccountTitle}
        message={t.accounts.removeAccountModalDesc || t.accounts.removeAccountConfirm}
        itemName={accountToDelete?.accountName}
        itemIcon={accountToDelete?.avatarUrl}
        itemBadge={accountToDelete?.isMaster ? t.accounts.masterBadge : undefined}
        confirmText={t.accounts.removeAccountBtn || 'Kaldır'}
        cancelText={t.accounts.cancelBtn || 'İptal'}
        type="danger"
        icon="🗑️"
        onConfirm={handleConfirmRemove}
        onCancel={() => setAccountToDelete(null)}
      />
    </div>
  );
};
