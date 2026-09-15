import https from 'https';

export interface MarketPriceInfo {
  success: boolean;
  lowestPrice?: string;
  volume?: string;
  medianPrice?: string;
  numericLowestPrice?: number;
  currencySymbol?: string;
}

export class MarketService {
  private static priceCache = new Map<string, { timestamp: number; data: MarketPriceInfo }>();

  /**
   * Fetches the lowest price for a Steam Trading Card (AppID 753 is Steam Community Items)
   */
  public static async getCardPrice(marketHashName: string, currency = 1): Promise<MarketPriceInfo> {
    if (!marketHashName || typeof marketHashName !== 'string') {
      return { success: false };
    }

    const cleanCurrency = Number.isInteger(Number(currency)) && Number(currency) > 0 ? Number(currency) : 1;
    const cacheKey = `${cleanCurrency}::${marketHashName}`;
    const cached = this.priceCache.get(cacheKey);
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 dakika

    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return cached.data;
    }

    return new Promise((resolve) => {
      const encodedName = encodeURIComponent(marketHashName.slice(0, 200));
      const url = `https://steamcommunity.com/market/priceoverview/?currency=${cleanCurrency}&appid=753&market_hash_name=${encodedName}`;

      const req = https
        .get(url, { headers: { 'User-Agent': 'MidlePlus-Desktop/1.2' }, timeout: 10000 }, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
            if (data.length > 100000) {
              req.destroy();
              resolve({ success: false });
            }
          });
          res.on('end', () => {
            try {
              if (res.statusCode === 200) {
                const json = JSON.parse(data);
                let numericLowest = 0;
                let currencySymbol = '$';

                const samplePriceStr = json.lowest_price || json.median_price || '';
                if (samplePriceStr) {
                  // Ayıkla: e.g. "$0.12", "0,12€", "1.50 TL", "£0.10"
                  const clean = samplePriceStr.replace(/[^0-9.,]/g, '').replace(',', '.');
                  numericLowest = parseFloat(clean) || 0;

                  // Sembolü ayıkla
                  const rawSymbol = samplePriceStr.replace(/[0-9.,\s]/g, '').trim();
                  if (rawSymbol) {
                    currencySymbol = rawSymbol;
                  }
                }

                const result: MarketPriceInfo = {
                  success: true,
                  lowestPrice: json.lowest_price,
                  volume: json.volume,
                  medianPrice: json.median_price,
                  numericLowestPrice: numericLowest,
                  currencySymbol,
                };
                MarketService.priceCache.set(cacheKey, { timestamp: Date.now(), data: result });
                resolve(result);
              } else {
                resolve({ success: false });
              }
            } catch {
              resolve({ success: false });
            }
          });
        });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false });
      });
      req.on('error', () => {
        resolve({ success: false });
      });
    });
  }

  /**
   * Calculates undercut price based on current market price and user settings
   */
  public static calculateListingPrice(currentLowest: number, undercutAmount = 0.01): number {
    if (currentLowest <= 0.03) return currentLowest;
    const finalPrice = Math.max(0.03, currentLowest - undercutAmount);
    return Math.round(finalPrice * 100) / 100;
  }
}
