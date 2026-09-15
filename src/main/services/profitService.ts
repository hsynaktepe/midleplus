import https from 'https';
import { MarketService } from './marketService';
import { ProfitableGameItem } from '../../shared/types';

export interface CuratedGameConfig {
  appId: number;
  title: string;
  totalCards: number;
  expectedCardPrice: number;
}

// Curated high-profit potential PAID games pool with verified Steam trading cards
// Free-to-play games are strictly excluded as they do not drop cards without in-game purchases.
const CURATED_PROFIT_GAMES: CuratedGameConfig[] = [
  { appId: 494890, title: 'Montaro', totalCards: 5, expectedCardPrice: 0.16 },
  { appId: 1137020, title: 'Zup! Zero', totalCards: 5, expectedCardPrice: 0.18 },
  { appId: 895690, title: 'Zup! X', totalCards: 5, expectedCardPrice: 0.17 },
  { appId: 434570, title: 'Blood and Bacon', totalCards: 6, expectedCardPrice: 0.14 },
  { appId: 1369340, title: 'Cats Organized Neatly', totalCards: 5, expectedCardPrice: 0.20 },
  { appId: 790830, title: 'SiNKR', totalCards: 5, expectedCardPrice: 0.18 },
  { appId: 881080, title: 'Grim Nights', totalCards: 6, expectedCardPrice: 0.16 },
  { appId: 359050, title: 'Shower With Your Dad Simulator 2015', totalCards: 5, expectedCardPrice: 0.16 },
  { appId: 264200, title: 'One Finger Death Punch', totalCards: 5, expectedCardPrice: 0.15 },
  { appId: 223470, title: 'POSTAL 2', totalCards: 6, expectedCardPrice: 0.15 },
  { appId: 1121080, title: 'Hentai Girl', totalCards: 5, expectedCardPrice: 0.24 },
  { appId: 40800, title: 'Super Meat Boy', totalCards: 5, expectedCardPrice: 0.15 },
  { appId: 550, title: 'Left 4 Dead 2', totalCards: 8, expectedCardPrice: 0.13 },
  { appId: 620, title: 'Portal 2', totalCards: 8, expectedCardPrice: 0.13 },
  { appId: 218620, title: 'PAYDAY 2', totalCards: 6, expectedCardPrice: 0.13 },
  { appId: 105600, title: 'Terraria', totalCards: 9, expectedCardPrice: 0.13 },
  { appId: 219740, title: "Don't Starve", totalCards: 6, expectedCardPrice: 0.15 },
  { appId: 322330, title: "Don't Starve Together", totalCards: 8, expectedCardPrice: 0.16 },
  { appId: 250900, title: 'The Binding of Isaac: Rebirth', totalCards: 9, expectedCardPrice: 0.15 },
  { appId: 945360, title: 'Among Us', totalCards: 5, expectedCardPrice: 0.15 },
  { appId: 367520, title: 'Hollow Knight', totalCards: 5, expectedCardPrice: 0.16 },
  { appId: 504230, title: 'Celeste', totalCards: 6, expectedCardPrice: 0.14 },
  { appId: 413150, title: 'Stardew Valley', totalCards: 6, expectedCardPrice: 0.15 },
  { appId: 219150, title: 'Hotline Miami', totalCards: 6, expectedCardPrice: 0.15 },
  { appId: 322170, title: 'Geometry Dash', totalCards: 6, expectedCardPrice: 0.13 },
  { appId: 48000, title: 'Limbo', totalCards: 5, expectedCardPrice: 0.14 },
  { appId: 203160, title: 'Tomb Raider', totalCards: 7, expectedCardPrice: 0.13 },
  { appId: 204360, title: 'Castle Crashers', totalCards: 6, expectedCardPrice: 0.14 },
  { appId: 646570, title: 'Slay the Spire', totalCards: 5, expectedCardPrice: 0.16 },
  { appId: 1145360, title: 'Hades', totalCards: 5, expectedCardPrice: 0.16 },
  { appId: 4000, title: "Garry's Mod", totalCards: 9, expectedCardPrice: 0.14 },
  { appId: 381210, title: 'Dead by Daylight', totalCards: 8, expectedCardPrice: 0.13 },
  { appId: 739630, title: 'Phasmophobia', totalCards: 6, expectedCardPrice: 0.15 },
  { appId: 108600, title: 'Project Zomboid', totalCards: 6, expectedCardPrice: 0.14 },
  { appId: 268910, title: 'Cuphead', totalCards: 6, expectedCardPrice: 0.15 },
  { appId: 227300, title: 'Euro Truck Simulator 2', totalCards: 8, expectedCardPrice: 0.13 },
];

interface CacheEntry {
  item: ProfitableGameItem;
  cachedAt: number;
}

export class ProfitService {
  private static cache = new Map<number, CacheEntry>();
  private static CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache

  public static clearCache(): void {
    this.cache.clear();
  }

  /**
   * Fetches real-time Steam Store price and discount data for a given AppID
   */
  public static async fetchStorePrice(
    appId: number,
    countryCode = 'tr'
  ): Promise<{ price: number; originalPrice: number; isFree: boolean; discountPercent: number; success: boolean }> {
    return new Promise((resolve) => {
      const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=${countryCode}`;
      const req = https.get(url, { headers: { 'User-Agent': 'MidlePlus-ProfitFinder/1.2' }, timeout: 8000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const json = JSON.parse(data);
              const appData = json[String(appId)];
              if (appData && appData.success && appData.data) {
                // If it's a free game, flag it so it won't be treated as a profitable card game
                if (appData.data.is_free) {
                  return resolve({ price: 0, originalPrice: 0, isFree: true, discountPercent: 0, success: true });
                }

                if (appData.data.price_overview) {
                  const rawFinal = appData.data.price_overview.final; // in cents, e.g. 99 for $0.99
                  const rawInitial = appData.data.price_overview.initial || rawFinal;
                  const finalPrice = typeof rawFinal === 'number' ? Math.round(rawFinal) / 100 : 0.99;
                  const originalPrice = typeof rawInitial === 'number' ? Math.round(rawInitial) / 100 : finalPrice;
                  const discount = appData.data.price_overview.discount_percent || 0;
                  return resolve({
                    price: finalPrice,
                    originalPrice,
                    isFree: false,
                    discountPercent: discount,
                    success: true,
                  });
                }
              }
            }
          } catch {
            // parse error fallback
          }
          resolve({ price: 0.99, originalPrice: 0.99, isFree: false, discountPercent: 0, success: false });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ price: 0.99, originalPrice: 0.99, isFree: false, discountPercent: 0, success: false });
      });
      req.on('error', () => {
        resolve({ price: 0.99, originalPrice: 0.99, isFree: false, discountPercent: 0, success: false });
      });
    });
  }

  /**
   * Evaluates profit potential for curated games pool
   */
  public static async getProfitableGames(
    ownedAppIds: Set<number>,
    currencySymbol = '$',
    maxPrice = 5.0,
    forceRefresh = false
  ): Promise<ProfitableGameItem[]> {
    if (forceRefresh) {
      this.clearCache();
    }

    const results: ProfitableGameItem[] = [];
    const now = Date.now();

    // Determine regional store pricing code (tr for MENA-USD and Turkish Lira, us for US Dollar)
    const countryCode = currencySymbol === '₺' || currencySymbol === '$' ? 'tr' : 'us';

    for (const game of CURATED_PROFIT_GAMES) {
      // Check cache first
      const cached = this.cache.get(game.appId);
      if (cached && !forceRefresh && now - cached.cachedAt < this.CACHE_TTL_MS) {
        const item = { ...cached.item, isOwned: ownedAppIds.has(game.appId) };
        if (item.gamePrice <= maxPrice) {
          results.push(item);
        }
        continue;
      }

      try {
        // 1. Fetch Store Price and Discount details
        const storeInfo = await this.fetchStorePrice(game.appId, countryCode);

        // Discard free games from profit evaluation
        if (storeInfo.isFree) continue;

        const gamePrice = storeInfo.price;
        const originalPrice = storeInfo.originalPrice;
        const discountPercent = storeInfo.discountPercent;

        // 2. Determine realistic card market value
        const avgCardPrice = game.expectedCardPrice || 0.15;
        const cardsDropCount = Math.ceil(game.totalCards / 2);
        const totalCardsValue = Math.round(cardsDropCount * avgCardPrice * 100) / 100;

        // 3. Steam fee deduction (Net ~85% after 15% valve cut)
        const netRevenue = Math.round(totalCardsValue * 0.85 * 100) / 100;
        const netProfit = Math.round((netRevenue - gamePrice) * 100) / 100;
        const profitPercent = gamePrice > 0 ? Math.round((netProfit / gamePrice) * 100) : 0;

        const item: ProfitableGameItem = {
          appId: game.appId,
          gameTitle: game.title,
          headerImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/header.jpg`,
          gamePrice,
          originalPrice,
          discountPercent,
          totalCards: game.totalCards,
          cardsDropCount,
          avgCardPrice,
          totalCardsValue,
          netRevenue,
          netProfit,
          profitPercent,
          isOwned: ownedAppIds.has(game.appId),
          storeUrl: `https://store.steampowered.com/app/${game.appId}/`,
        };

        this.cache.set(game.appId, { item, cachedAt: now });

        if (gamePrice <= maxPrice) {
          results.push(item);
        }
      } catch (err) {
        console.warn(`[ProfitService] Failed to evaluate profit for appId ${game.appId}:`, err);
      }
    }

    // Sort by highest net profit by default
    return results.sort((a, b) => b.netProfit - a.netProfit);
  }
}
