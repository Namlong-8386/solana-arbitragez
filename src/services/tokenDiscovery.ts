import axios from 'axios';
import { CONFIG } from '../config';
import { TokenInfo } from '../types/arbitrage';

export class TokenDiscoveryService {
  private activeTokens: Map<string, TokenInfo> = new Map();
  private lastUpdate: number = 0;
  private readonly REFRESH_INTERVAL_MS = 10 * 60 * 1000; // Refresh the full list every 10 minutes

  // Base reserve tokens always present
  private baseTokens: TokenInfo[] = [
    {
      symbol: 'SOL',
      name: 'Wrapped SOL',
      address: CONFIG.WRAPPED_SOL_MINT,
      decimals: 9,
      tags: ['base', 'solana']
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: CONFIG.USDC_MINT,
      decimals: 6,
      tags: ['stablecoin']
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      address: CONFIG.USDT_MINT,
      decimals: 6,
      tags: ['stablecoin']
    }
  ];

  constructor() {
    // Initialize with base tokens
    this.baseTokens.forEach(token => this.activeTokens.set(token.address, token));
  }

  /**
   * Fetch top liquid, high-volume tokens on Solana dynamically
   */
  public async fetchDynamicTopTokens(): Promise<TokenInfo[]> {
    const now = Date.now();
    if (now - this.lastUpdate < this.REFRESH_INTERVAL_MS && this.activeTokens.size > this.baseTokens.length) {
      return Array.from(this.activeTokens.values());
    }

    console.log('[TokenDiscovery] Auto-discovering top active tokens on Solana...');

    try {
      // 1. Fetch from Jupiter strict list
      const response = await axios.get<TokenInfo[]>(CONFIG.JUPITER_TOKENS_API, { timeout: 8000 });
      if (Array.isArray(response.data)) {
        // Filter out tokens with valid symbol and mint address
        const validTokens = response.data.filter(t => t.address && t.symbol && t.decimals);
        
        // Replace the dynamic portion on every refresh so removed/stale tokens
        // do not remain in the scan forever. There is intentionally no cap:
        // every valid token returned by Jupiter is eligible for scanning.
        const refreshedTokens = new Map<string, TokenInfo>();
        this.baseTokens.forEach(token => refreshedTokens.set(token.address, token));

        validTokens.forEach(t => {
          refreshedTokens.set(t.address, {
            symbol: t.symbol,
            name: t.name,
            address: t.address,
            decimals: t.decimals,
            logoURI: t.logoURI,
            tags: t.tags || []
          });
        });

        this.activeTokens = refreshedTokens;
      }
    } catch (err: any) {
      console.warn('[TokenDiscovery] Failed to refresh the full Jupiter token list; keeping the current list:', err.message);
      // Keep the last successful full list when a refresh fails. On startup,
      // use the fallback list so the scanner can still begin.
      if (this.activeTokens.size <= this.baseTokens.length) {
        this.getFallbackTokens().forEach(t => this.activeTokens.set(t.address, t));
      }
    }

    this.lastUpdate = now;
    console.log(`[TokenDiscovery] Active token list dynamically updated (${this.activeTokens.size} tokens total).`);
    return Array.from(this.activeTokens.values());
  }

  public getActiveTokens(): TokenInfo[] {
    return Array.from(this.activeTokens.values());
  }

  public getTokenByMint(mint: string): TokenInfo | undefined {
    return this.activeTokens.get(mint);
  }

  private getFallbackTokens(): TokenInfo[] {
    return [
      ...this.baseTokens,
      { symbol: 'JUP', name: 'Jupiter', address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6 },
      { symbol: 'BONK', name: 'Bonk', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5 },
      { symbol: 'WIF', name: 'dogwifhat', address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', decimals: 6 },
      { symbol: 'POPCAT', name: 'Popcat', address: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8u7b5k357', decimals: 9 },
      { symbol: 'RAY', name: 'Raydium', address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', decimals: 6 },
      { symbol: 'RENDER', name: 'Render Token', address: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', decimals: 8 },
      { symbol: 'PYTH', name: 'Pyth Network', address: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', decimals: 6 }
    ];
  }
}

export const tokenDiscoveryService = new TokenDiscoveryService();
