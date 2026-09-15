import React, { useEffect } from 'react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  subMessage?: string;
  itemName?: string;
  itemIcon?: string;
  itemBadge?: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  icon?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  subMessage,
  itemName,
  itemIcon,
  itemBadge,
  confirmText = 'Onayla',
  cancelText = 'İptal',
  type = 'danger',
  icon = '🗑️',
  onConfirm,
  onCancel,
}) => {
  // Klavye kısayolları: Escape iptal, Enter onayla
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, onConfirm]);

  if (!isOpen) return null;

  const isDanger = type === 'danger';
  const isWarning = type === 'warning';

  const accentColor = isDanger
    ? 'rgba(239, 68, 68, 1)'
    : isWarning
    ? 'rgba(245, 158, 11, 1)'
    : 'var(--neon-cyan)';

  const accentBg = isDanger
    ? 'rgba(239, 68, 68, 0.12)'
    : isWarning
    ? 'rgba(245, 158, 11, 0.12)'
    : 'rgba(0, 242, 254, 0.12)';

  const accentBorder = isDanger
    ? 'rgba(239, 68, 68, 0.35)'
    : isWarning
    ? 'rgba(245, 158, 11, 0.35)'
    : 'rgba(0, 242, 254, 0.35)';

  const accentGlow = isDanger
    ? '0 0 20px rgba(239, 68, 68, 0.25)'
    : isWarning
    ? '0 0 20px rgba(245, 158, 11, 0.25)'
    : '0 0 20px rgba(0, 242, 254, 0.25)';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3500,
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '460px',
          maxWidth: '92vw',
          borderRadius: '12px',
          border: `1px solid ${accentBorder}`,
          boxShadow: `0 24px 60px rgba(0, 0, 0, 0.85), ${accentGlow}`,
          padding: '24px',
          background: 'var(--bg-card)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Üst Kısım: İkon, Başlık ve Kapat Butonu */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '10px',
                background: accentBg,
                border: `1px solid ${accentBorder}`,
                boxShadow: accentGlow,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 800, color: '#ffffff', letterSpacing: '0.2px' }}>
                {title}
              </h3>
            </div>
          </div>

          <button
            className="win-btn close"
            onClick={onCancel}
            title={cancelText}
            style={{ padding: '6px' }}
          >
            ✕
          </button>
        </div>

        {/* Mesaj Gövdesi */}
        <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
          {message}
        </div>

        {/* Eğer Vurgulanan Bir Öğe (Örn: Hesap Adı) Varsa */}
        {itemName && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {itemIcon ? (
                <img
                  src={itemIcon}
                  alt={itemName}
                  style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: '1.1rem' }}>👤</span>
              )}
              <span style={{ fontWeight: 700, color: 'var(--neon-cyan)', fontSize: '0.95rem' }}>
                {itemName}
              </span>
            </div>
            {itemBadge && (
              <span className="badge badge-gold" style={{ fontSize: '0.7rem' }}>
                {itemBadge}
              </span>
            )}
          </div>
        )}

        {/* Ek Açıklama / Alt Not */}
        {subMessage && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
            {subMessage}
          </div>
        )}

        {/* Butonlar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '8px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            style={{ padding: '8px 18px', fontSize: '0.85rem' }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={isDanger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
            style={{
              padding: '8px 20px',
              fontSize: '0.85rem',
              fontWeight: 700,
              boxShadow: isDanger ? '0 2px 10px rgba(220, 38, 38, 0.4)' : undefined,
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
