import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import axios from 'axios';
import { CONFIG } from '../config';

export class SolanaService {
  public connection: Connection;
  private cachedSolPriceUSD: number = 150;
  private lastPriceFetch: number = 0;

  constructor() {
    this.connection = new Connection(CONFIG.SOLANA_RPC_URL, 'confirmed');
  }

  public async getSolPriceUSD(): Promise<number> {
    const now = Date.now();
    // Cache for 1 minute
    if (now - this.lastPriceFetch < 60000 && this.cachedSolPriceUSD > 0) {
      return this.cachedSolPriceUSD;
    }

    try {
      const response = await axios.get(
        `https://api.jup.ag/price/v2?ids=${CONFIG.WRAPPED_SOL_MINT}`,
        { timeout: 4000 }
      );
      const data = response.data?.data?.[CONFIG.WRAPPED_SOL_MINT];
      if (data && data.price) {
        this.cachedSolPriceUSD = parseFloat(data.price);
        this.lastPriceFetch = now;
      }
    } catch (err) {
      // Fallback endpoint
      try {
        const res = await axios.get(
          `https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT`,
          { timeout: 3000 }
        );
        if (res.data?.price) {
          this.cachedSolPriceUSD = parseFloat(res.data.price);
          this.lastPriceFetch = now;
        }
      } catch (e) {
        // preserve old cached price
      }
    }

    return this.cachedSolPriceUSD;
  }

  public lamportsToSol(lamports: number): number {
    return lamports / LAMPORTS_PER_SOL;
  }

  public solToLamports(sol: number): number {
    return Math.floor(sol * LAMPORTS_PER_SOL);
  }
}

export const solanaService = new SolanaService();
