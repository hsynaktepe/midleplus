import React, { useState } from 'react';
import { GameQueueItem } from '../../../shared/types';
import { getTranslations } from '../locales/i18n';

interface GamesQueueProps {
  queue: GameQueueItem[];
  lang: 'tr' | 'en';
  isScanning?: boolean;
  onStartNow: (appId: number) => void;
  onRemove: (appId: number) => void;
  onToggleHide: (appId: number, isHidden: boolean) => void;
  onToggleHideAll?: (isHidden: boolean) => void;
  onRefreshBadges: () => void;
  onReorder: (newOrder: number[]) => void;
}

export const GamesQueue: React.FC<GamesQueueProps> = ({
  queue,
  lang,
  isScanning,
  onStartNow,
  onRemove,
  onToggleHide,
  onToggleHideAll,
  onRefreshBadges,
  onReorder,
}) => {
  const t = getTranslations(lang);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'warmup' | 'ready' | 'hidden'>('all');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const hiddenCount = queue.filter((item) => item.isBlacklisted).length;
  const activeCount = queue.length - hiddenCount;

  // Filtreleme mantığı
  const filteredQueue = queue.filter((item) => {
    const matchesSearch = item.gameTitle.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (filter === 'hidden') {
      return item.isBlacklisted === true;
    }

    // Diğer sekmelerde gizlenmiş (karalisteye alınmış) oyunları gösterme
    if (item.isBlacklisted) return false;

    if (filter === 'warmup') return item.playtimeMinutes < 120;
    if (filter === 'ready') return item.playtimeMinutes >= 120;
    return true;
  });

  // Klavye / Butonla yukarı/aşağı taşıma
  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= filteredQueue.length) return;

    const sourceItem = filteredQueue[index];
    const targetItem = filteredQueue[targetIndex];
    if (!sourceItem || !targetItem) return;

    const newQueue = [...queue];
    const fromPos = newQueue.findIndex((g) => g.appId === sourceItem.appId);
    const toPos = newQueue.findIndex((g) => g.appId === targetItem.appId);

    if (fromPos !== -1 && toPos !== -1) {
      const [moved] = newQueue.splice(fromPos, 1);
      newQueue.splice(toPos, 0, moved);
      onReorder(newQueue.map((item) => item.appId));
    }
  };

  // Drag & Drop Fonksiyonları
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (index: number) => {
    if (dragOverIndex === index) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const sourceItem = filteredQueue[draggedIndex];
    const targetItem = filteredQueue[targetIndex];
    if (!sourceItem || !targetItem) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newQueue = [...queue];
    const fromPos = newQueue.findIndex((g) => g.appId === sourceItem.appId);
    const toPos = newQueue.findIndex((g) => g.appId === targetItem.appId);

    if (fromPos !== -1 && toPos !== -1) {
      const [moved] = newQueue.splice(fromPos, 1);
      newQueue.splice(toPos, 0, moved);
      onReorder(newQueue.map((item) => item.appId));
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Header & Search Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'var(--bg-secondary)',
          padding: '12px 16px',
          borderRadius: '6px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder={t.queue.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '4px',
                padding: '7px 12px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-main)',
                fontSize: '0.85rem',
                width: '210px',
                outline: 'none',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-primary)', padding: '3px', borderRadius: '4px' }}>
            <button
              className={`btn btn-secondary ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
              style={{ padding: '5px 12px', fontSize: '0.78rem', borderRadius: '3px' }}
            >
              {t.queue.activeQueue} ({activeCount})
            </button>
            <button
              className={`btn btn-secondary ${filter === 'warmup' ? 'active' : ''}`}
              onClick={() => setFilter('warmup')}
              style={{ padding: '5px 12px', fontSize: '0.78rem', borderRadius: '3px' }}
            >
              {t.queue.warmupTab}
            </button>
            <button
              className={`btn btn-secondary ${filter === 'ready' ? 'active' : ''}`}
              onClick={() => setFilter('ready')}
              style={{ padding: '5px 12px', fontSize: '0.78rem', borderRadius: '3px' }}
            >
              {t.queue.readyTab}
            </button>
            <button
              className={`btn btn-secondary ${filter === 'hidden' ? 'active' : ''}`}
              onClick={() => setFilter('hidden')}
              style={{
                padding: '5px 12px',
                fontSize: '0.78rem',
                borderRadius: '3px',
                color: hiddenCount > 0 ? 'var(--color-warning)' : undefined,
              }}
            >
              {t.queue.hiddenTab} ({hiddenCount})
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {filter !== 'hidden' && activeCount > 0 && onToggleHideAll && (
            <button
              className="btn btn-secondary"
              onClick={() => onToggleHideAll(true)}
              style={{
                height: '34px',
                padding: '0 12px',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--text-muted)',
              }}
              title={t.queue.hideAllTitle}
            >
              {t.queue.hideAll}
            </button>
          )}

          {filter === 'hidden' && hiddenCount > 0 && onToggleHideAll && (
            <button
              className="btn btn-secondary"
              onClick={() => onToggleHideAll(false)}
              style={{
                height: '34px',
                padding: '0 12px',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--color-success)',
                borderColor: 'rgba(164, 208, 7, 0.4)',
              }}
              title={t.queue.restoreAllTitle}
            >
              {t.queue.restoreAll}
            </button>
          )}

          <button
            className="btn btn-secondary"
            onClick={onRefreshBadges}
            disabled={isScanning}
            style={{
              minWidth: '200px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              height: '34px',
              fontSize: '0.82rem',
            }}
          >
            {isScanning ? (
              <>
                <span className="spinner" style={{ width: '13px', height: '13px', borderWidth: '2px' }}></span>
                {t.queue.scanningBadges}
              </>
            ) : (
              <>
                🔄 {t.queue.scanBadges}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Reorder Help Message */}
      {filter !== 'hidden' && filteredQueue.length > 1 && (
        <div
          style={{
            fontSize: '0.76rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0 4px',
          }}
        >
          <span style={{ color: 'var(--steam-cyan)' }}>💡</span>
          {t.queue.dragHint}
        </div>
      )}

      {/* Queue List */}
      {filteredQueue.length === 0 ? (
        <div
          className="glass-card"
          style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>
            {filter === 'hidden' ? '👁️' : '🎮'}
          </div>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: 600 }}>
            {filter === 'hidden' ? t.queue.noHiddenTitle : t.queue.noQueueTitle}
          </p>
          <p style={{ fontSize: '0.82rem', maxWidth: '440px', margin: '0 auto', lineHeight: 1.5 }}>
            {filter === 'hidden' ? t.queue.noHiddenDesc : t.queue.noQueueDesc}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredQueue.map((game, idx) => {
            const isDraggingThis = draggedIndex === idx;
            const isOverThis = dragOverIndex === idx;
            const canDrag = filter !== 'hidden' && !isScanning;

            return (
              <div
                key={game.appId}
                className={`queue-row ${isDraggingThis ? 'is-dragging' : ''} ${isOverThis ? 'drag-over' : ''} ${
                  game.isBlacklisted ? 'is-hidden-game' : ''
                }`}
                draggable={canDrag}
                onDragStart={(e) => canDrag && handleDragStart(e, idx)}
                onDragOver={(e) => canDrag && handleDragOver(e, idx)}
                onDragLeave={() => canDrag && handleDragLeave(idx)}
                onDrop={(e) => canDrag && handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
              >
                {/* Drag Handle & Index */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {canDrag ? (
                    <div
                      className="drag-handle"
                      title={t.queue.dragHandleTitle}
                    >
                      ⋮⋮
                    </div>
                  ) : (
                    <div style={{ width: '16px' }} />
                  )}

                  <span
                    style={{
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.8rem',
                      width: '24px',
                      textAlign: 'center',
                    }}
                  >
                    #{idx + 1}
                  </span>
                </div>

                {/* Game Header Banner Image */}
                <img
                  src={game.headerImage}
                  alt={game.gameTitle}
                  style={{
                    width: '110px',
                    height: '46px',
                    borderRadius: '4px',
                    objectFit: 'cover',
                    background: '#0e141b',
                    border: '1px solid rgba(0,0,0,0.3)',
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/header.jpg`;
                  }}
                />

                {/* Game Title & Meta Details */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.92rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: 'var(--text-primary)',
                      letterSpacing: '0.2px',
                    }}
                    title={game.gameTitle}
                  >
                    {game.gameTitle}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '4px', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: game.playtimeMinutes < 120 ? 'var(--steam-cyan)' : 'var(--text-secondary)',
                        fontWeight: 600,
                      }}
                    >
                      ⏱ {(game.playtimeMinutes / 60).toFixed(1)} {t.queue.hrsPlayed}
                    </span>

                    {game.playtimeMinutes < 120 ? (
                      <span className="badge badge-cyan" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                        {t.queue.warmupBadge}
                      </span>
                    ) : (
                      <span className="badge badge-green" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                        {t.queue.dropReadyBadge}
                      </span>
                    )}

                    {game.isVac && (
                      <span className="badge badge-red" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                        VAC
                      </span>
                    )}
                  </div>
                </div>

                {/* Cards Remaining Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge badge-gold" style={{ fontSize: '0.8rem', padding: '4px 8px' }}>
                    🃏 {game.cardsRemaining} {t.queue.cardsLeft}
                  </span>
                </div>

                {/* Move Up/Down Buttons */}
                {canDrag && (
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <button
                      className="win-btn"
                      onClick={() => handleMove(idx, 'up')}
                      disabled={idx === 0}
                      title={t.queue.moveUp}
                      style={{ height: '28px', width: '28px', fontSize: '0.75rem' }}
                    >
                      ▲
                    </button>
                    <button
                      className="win-btn"
                      onClick={() => handleMove(idx, 'down')}
                      disabled={idx === filteredQueue.length - 1}
                      title={t.queue.moveDown}
                      style={{ height: '28px', width: '28px', fontSize: '0.75rem' }}
                    >
                      ▼
                    </button>
                  </div>
                )}

                {/* Action Buttons: Steam Style */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {filter === 'hidden' ? (
                    <button
                      className="btn btn-primary"
                      onClick={() => onToggleHide(game.appId, false)}
                      style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                      title={t.queue.restoreToQueueTitle}
                    >
                      ➕ {t.queue.restoreToQueue}
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn btn-primary"
                        onClick={() => onStartNow(game.appId)}
                        style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                        title={t.queue.idleNowTitle}
                      >
                        ⚡ {t.queue.idleNow}
                      </button>

                      <button
                        className="btn btn-secondary"
                        onClick={() => onToggleHide(game.appId, true)}
                        style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                        title={t.queue.hideTitle}
                      >
                        👁️ {t.queue.hide}
                      </button>

                      <button
                        className="btn btn-danger"
                        onClick={() => onRemove(game.appId)}
                        style={{ padding: '6px 9px', fontSize: '0.75rem' }}
                        title={t.queue.removeFromQueueTitle}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
