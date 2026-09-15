export interface LootResult {
  success: boolean;
  transferredCount: number;
  tradeOfferId?: string;
  message: string;
}

export class LootService {
  /**
   * Generates trade offer payload to transfer Steam Trading Cards (AppID 753, ContextID 6)
   * from a bot account to the designated Master Account.
   */
  public static async transferCardsToMaster(
    communityInstance: any,
    targetMasterSteamId: string,
    isTurkish: boolean = true,
    onProgress?: (msg: string) => void
  ): Promise<LootResult> {
    if (!communityInstance) {
      return {
        success: false,
        transferredCount: 0,
        message: isTurkish ? 'Steam Topluluk oturumu aktif değil.' : 'Steam Community session is not active.',
      };
    }

    const cleanTargetSteamId = typeof targetMasterSteamId === 'string' ? targetMasterSteamId.trim() : '';
    if (!cleanTargetSteamId || !/^[0-9]{15,20}$/.test(cleanTargetSteamId)) {
      return {
        success: false,
        transferredCount: 0,
        message: isTurkish
          ? 'Geçersiz ana hesap SteamID (SteamID64 formatında olmalı).'
          : 'Invalid master account SteamID (must be 17-digit SteamID64 format).',
      };
    }

    onProgress?.(isTurkish ? 'Kart envanteri taranıyor...' : 'Scanning card inventory...');

    return new Promise((resolve) => {
      // Load user inventory for Steam Trading Cards (AppID 753, Context 6)
      communityInstance.getUserInventoryContents(
        communityInstance.steamID,
        753,
        6,
        true,
        (err: any, inventory: any[]) => {
          if (err || !inventory) {
            resolve({
              success: false,
              transferredCount: 0,
              message: isTurkish
                ? `Envanter yüklenemedi: ${err?.message || 'Bilinmeyen hata'}`
                : `Failed to load inventory: ${err?.message || 'Unknown error'}`,
            });
            return;
          }

          // Filter for trading cards only
          const cardsToTransfer = inventory.filter(
            (item) => item.type && item.type.toLowerCase().includes('trading card')
          );

          if (cardsToTransfer.length === 0) {
            resolve({
              success: true,
              transferredCount: 0,
              message: isTurkish
                ? 'Aktarılacak koleksiyon kartı bulunamadı.'
                : 'No trading cards found to transfer.',
            });
            return;
          }

          onProgress?.(
            isTurkish
              ? `${cardsToTransfer.length} adet kart bulundu, takas teklifi hazırlanıyor...`
              : `Found ${cardsToTransfer.length} cards, preparing trade offer...`
          );

          // Prepare trade offer
          const offer = communityInstance.createTrade(cleanTargetSteamId);
          for (const card of cardsToTransfer) {
            offer.addMyItem(card);
          }

          offer.setMessage('IdlePlus Otomatik Kart Aktarımı (Loot to Master)');
          offer.send((sendErr: any, status: any) => {
            if (sendErr) {
              resolve({
                success: false,
                transferredCount: 0,
                message: isTurkish
                  ? `Takas gönderilemedi: ${sendErr.message}`
                  : `Failed to send trade offer: ${sendErr.message}`,
              });
              return;
            }

            resolve({
              success: true,
              transferredCount: cardsToTransfer.length,
              tradeOfferId: offer.id,
              message: isTurkish
                ? `${cardsToTransfer.length} kart başarıyla ana hesaba aktarılmak üzere takas teklifi gönderildi. Lütfen Steam Mobil uygulamanızdan takası onaylayın.`
                : `Trade offer sent successfully to transfer ${cardsToTransfer.length} cards to master account. Please confirm the trade in your Steam Mobile app.`,
            });
          });
        }
      );
    });
  }
}
