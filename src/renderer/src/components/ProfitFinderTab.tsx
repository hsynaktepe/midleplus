import React, { useState, useEffect, useMemo } from 'react';
import { ProfitableGameItem } from '../../../shared/types';
import { getTranslations } from '../locales/i18n';

interface ProfitFinderTabProps {
  lang: 'tr' | 'en';
  currencySymbol: string;
}

export const ProfitFinderTab: React.FC<ProfitFinderTabProps> = ({
  lang,
  currencySymbol,
}) => {
  const t = getTranslations(lang);
  const [games, setGames] = useState<ProfitableGameItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [maxPriceFilter, setMaxPriceFilter] = useState<string>('5.00');
  const [hideOwned, setHideOwned] = useState<boolean>(false);
  const [onlyProfitable, setOnlyProfitable] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<'profit' | 'percent' | 'price'>('profit');

  const fetchProfitableGames = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      if (window.api?.getProfitableGames) {
        const numMax = parseFloat(maxPriceFilter) || 5.0;
        const data = await window.api.getProfitableGames({ maxPrice: numMax, forceRefresh });
        setGames(data || []);
      }
    } catch (err) {
      console.error('[ProfitFinder] Failed to fetch profitable games:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfitableGames(false);
  }, [maxPriceFilter]);

  const filteredAndSortedGames = useMemo(() => {
    return games
      .filter((game) => {
        if (onlyProfitable && game.netProfit <= 0) return false;
        if (hideOwned && game.isOwned) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = game.gameTitle.toLowerCase().includes(q);
          const matchAppId = game.appId.toString().includes(q);
          if (!matchTitle && !matchAppId) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'profit') {
          return b.netProfit - a.netProfit;
        } else if (sortBy === 'percent') {
          return b.profitPercent - a.profitPercent;
        } else {
          return a.gamePrice - b.gamePrice;
        }
      });
  }, [games, onlyProfitable, hideOwned, searchQuery, sortBy]);

  const stats = useMemo(() => {
    const profitable = games.filter((g) => {
      if (hideOwned && g.isOwned) return false;
      return g.netProfit > 0;
    });
    const maxProfit = profitable.length > 0 ? Math.max(...profitable.map((g) => g.netProfit)) : 0;
    const totalPotentialProfit = profitable.reduce((acc, g) => acc + (!g.isOwned ? g.netProfit : 0), 0);
    return {
      count: profitable.length,
      maxProfit: Math.round(maxProfit * 100) / 100,
      totalPotentialProfit: Math.round(totalPotentialProfit * 100) / 100,
    };
  }, [games, hideOwned]);

  const handleOpenStore = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="profit-finder-container">
      {/* Header Banner */}
      <div className="profit-finder-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', padding: '20px 24px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
            <span>🎯</span> {t.profitFinder.title}
          </h2>
          <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            {t.profitFinder.subtitle}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="profit-finder-stats-box">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                {lang === 'tr' ? 'Kârlı Oyun' : 'Profitable Games'}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--border-accent, #38bdf8)' }}>
                {stats.count}
              </div>
            </div>
            <div className="profit-finder-divider" />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                {lang === 'tr' ? 'Maks Kâr' : 'Max Profit'}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#16a34a' }}>
                +{currencySymbol}{stats.maxProfit.toFixed(2)}
              </div>
            </div>
            <div className="profit-finder-divider" />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                {lang === 'tr' ? 'Toplam Potansiyel' : 'Total Potential'}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#9333ea' }}>
                +{currencySymbol}{stats.totalPotentialProfit.toFixed(2)}
              </div>
            </div>
          </div>

          <button
            className="btn btn-secondary"
            onClick={() => fetchProfitableGames(true)}
            disabled={isLoading}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', cursor: 'pointer' }}
            title={lang === 'tr' ? 'Steam mağaza fiyatlarını ve indirimleri canlı yenile' : 'Refresh live prices and discounts'}
          >
            <span style={{ display: 'inline-block', transform: isLoading ? 'rotate(360deg)' : 'none', transition: 'transform 0.8s ease' }}>
              🔄
            </span>
            {t.profitFinder.refresh}
          </button>
        </div>
      </div>

      {/* Control Filters Bar */}
      <div className="profit-finder-panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', padding: '14px 20px' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '180px' }}>
          <input
            type="text"
            className="profit-finder-input"
            placeholder={`🔍 ${t.profitFinder.searchPlaceholder}`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Max Price Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {t.profitFinder.filterMaxPrice}
          </span>
          <select
            className="profit-finder-select"
            value={maxPriceFilter}
            onChange={(e) => setMaxPriceFilter(e.target.value)}
          >
            <option value="0.99">{currencySymbol}0.99</option>
            <option value="1.99">{currencySymbol}1.99</option>
            <option value="2.99">{currencySymbol}2.99</option>
            <option value="5.00">{currencySymbol}5.00</option>
            <option value="999.00">{t.profitFinder.filterAllPrices}</option>
          </select>
        </div>

        {/* Sort By */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {lang === 'tr' ? 'Sıralama:' : 'Sort By:'}
          </span>
          <select
            className="profit-finder-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="profit">💰 {t.profitFinder.sortByProfit}</option>
            <option value="percent">📈 {t.profitFinder.sortByPercent}</option>
            <option value="price">🏷️ {t.profitFinder.sortByPrice}</option>
          </select>
        </div>

        {/* Only Profitable Checkbox */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={onlyProfitable}
            onChange={(e) => setOnlyProfitable(e.target.checked)}
            style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#16a34a' }}
          />
          <span style={{ fontWeight: 600, color: onlyProfitable ? '#16a34a' : 'var(--text-primary)' }}>
            {lang === 'tr' ? '✨ Sadece Kârlı Olanlar' : '✨ Only Profitable'}
          </span>
        </label>

        {/* Hide Owned Checkbox */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={hideOwned}
            onChange={(e) => setHideOwned(e.target.checked)}
            style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#0ea5e9' }}
          />
          <span style={{ color: 'var(--text-primary)' }}>{t.profitFinder.hideOwned}</span>
        </label>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="profit-finder-panel" style={{ textAlign: 'center', padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(14,165,233,0.2)', borderTopColor: '#0ea5e9', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.95rem' }}>
            {t.profitFinder.loading}
          </p>
        </div>
      ) : filteredAndSortedGames.length === 0 ? (
        <div className="profit-finder-panel" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '12px' }}>🎯</span>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 14px 0', fontSize: '1rem' }}>
            {onlyProfitable
              ? (lang === 'tr'
                  ? 'Seçili fiyat aralığında anlık kâr bırakan oyun bulunamadı. Fiyat filtresini artırabilir veya indirimleri yenilemek için "Yenile"ye basabilirsiniz.'
                  : 'No profitable games found in this price range. Try expanding the price filter or refresh live discounts.')
              : t.profitFinder.noGames}
          </p>
          {onlyProfitable && (
            <button
              className="btn btn-secondary"
              onClick={() => setOnlyProfitable(false)}
              style={{ padding: '6px 14px', fontSize: '0.82rem' }}
            >
              {lang === 'tr' ? 'Tüm Havuzu Göster (Kâr Olmayanlar Dahil)' : 'Show All Pool'}
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px',
            paddingBottom: '20px',
          }}
        >
          {filteredAndSortedGames.map((game) => {
            const isProfitable = game.netProfit > 0;
            const hasDiscount = Boolean(game.discountPercent && game.discountPercent > 0);

            return (
              <div
                key={game.appId}
                className={`profit-game-card ${isProfitable ? 'profitable' : ''}`}
              >
                {/* Header Image with Badges */}
                <div style={{ position: 'relative', width: '100%', height: '140px', background: 'var(--bg-surface)', overflow: 'hidden' }}>
                  <img
                    src={game.headerImage}
                    alt={game.gameTitle}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />

                  {/* Left Badges: Owned & Discount */}
                  <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {game.isOwned && (
                      <div
                        style={{
                          background: 'rgba(14, 165, 233, 0.92)',
                          backdropFilter: 'blur(6px)',
                          color: '#fff',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        }}
                      >
                        ✓ {t.profitFinder.ownedBadge}
                      </div>
                    )}

                    {hasDiscount && (
                      <div
                        style={{
                          background: '#16a34a',
                          color: '#fff',
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        }}
                      >
                        🏷️ -{game.discountPercent}%
                      </div>
                    )}
                  </div>

                  {/* Net Profit Badge on Image */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      background: isProfitable ? '#16a34a' : 'rgba(239, 68, 68, 0.9)',
                      backdropFilter: 'blur(6px)',
                      color: '#fff',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                    }}
                  >
                    <span>{isProfitable ? '+' : ''}{currencySymbol}{game.netProfit.toFixed(2)}</span>
                    <span style={{ fontSize: '0.66rem', opacity: 0.95 }}>
                      {isProfitable ? '+' : ''}{game.profitPercent}%
                    </span>
                  </div>
                </div>

                {/* Body Content */}
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, gap: '12px' }}>
                  {/* Title & AppID */}
                  <div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={game.gameTitle}>
                      {game.gameTitle}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      AppID: {game.appId} • {game.cardsDropCount} / {game.totalCards} {t.profitFinder.cardDrops}
                    </div>
                  </div>

                  {/* Pricing Matrix */}
                  <div className="profit-price-matrix">
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>
                        {t.profitFinder.gamePrice}
                      </span>
                      {hasDiscount ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                            {currencySymbol}{game.originalPrice?.toFixed(2)}
                          </span>
                          <strong style={{ color: '#16a34a' }}>
                            {currencySymbol}{game.gamePrice.toFixed(2)}
                          </strong>
                        </div>
                      ) : (
                        <strong style={{ color: 'var(--text-primary)' }}>
                          {currencySymbol}{game.gamePrice.toFixed(2)}
                        </strong>
                      )}
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>
                        {t.profitFinder.avgCardPrice}
                      </span>
                      <strong style={{ color: 'var(--border-accent, #0284c7)' }}>
                        ~{currencySymbol}{game.avgCardPrice.toFixed(2)}
                      </strong>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>
                        {t.profitFinder.netRevenue}
                      </span>
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {currencySymbol}{game.netRevenue.toFixed(2)}
                      </strong>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>
                        {t.profitFinder.netProfit}
                      </span>
                      <strong style={{ color: isProfitable ? '#16a34a' : '#ef4444' }}>
                        {isProfitable ? '+' : ''}{currencySymbol}{game.netProfit.toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ marginTop: 'auto', paddingTop: '6px' }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleOpenStore(game.storeUrl)}
                      style={{
                        width: '100%',
                        padding: '9px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        borderRadius: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      <span>🛒</span> {t.profitFinder.buyOnSteam}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

