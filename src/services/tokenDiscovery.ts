import axios from 'axios';
import { CONFIG } from '../config';
import { TokenInfo } from '../types/arbitrage';

type JupiterTokenRecord = Partial<TokenInfo> & {
  id?: string;
  icon?: string;
  isVerified?: boolean;
  organicScore?: number;
  liquidity?: number;
  stats24h?: {
    volume?: number;
  };
  audit?: {
    isSus?: boolean;
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
    topHoldersPercentage?: number;
  };
};

export class TokenDiscoveryService {
  private activeTokens: Map<string, TokenInfo> = new Map();
  private lastUpdate: number = 0;
  private readonly REFRESH_INTERVAL_MS = 10 * 60 * 1000; // Check for new tokens every 10 minutes

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
   * Discover additional tokens without dropping the tokens already accepted.
   * Jupiter's strict list is used as the source, with basic scam/junk filters.
   */
  public async fetchDynamicTopTokens(): Promise<TokenInfo[]> {
    const now = Date.now();
    if (now - this.lastUpdate < this.REFRESH_INTERVAL_MS && this.activeTokens.size > this.baseTokens.length) {
      return Array.from(this.activeTokens.values());
    }

    console.log('[TokenDiscovery] Auto-discovering new safe tokens on Solana...');

    try {
      // 1. Fetch from Jupiter strict list
      const response = await axios.get<JupiterTokenRecord[]>(CONFIG.JUPITER_TOKENS_API, { timeout: 8000 });
      if (!Array.isArray(response.data) || response.data.length === 0) {
        throw new Error('Jupiter returned an empty or invalid verified token list');
      }

      if (Array.isArray(response.data)) {
        // Keep accepted tokens across refreshes. A refresh only adds new safe
        // tokens and updates metadata; it never replaces the active list.
        response.data.forEach(t => {
          const token = this.normalizeToken(t);
          if (!token || !this.isSafeToken(t)) {
            // Remove a token already being tracked if a later refresh marks it
            // with a suspicious tag/name. Base reserve tokens are protected.
            const address = t.address || t.id;
            if (address && !this.isBaseToken(address) && t.audit?.isSus === true) {
              this.activeTokens.delete(address);
            }
            return;
          }

          this.activeTokens.set(token.address, token);
        });
      }
    } catch (err: any) {
      console.warn('[TokenDiscovery] Failed to discover new tokens; keeping the current safe list:', err.message);
      // Keep the last successful full list when a refresh fails. On startup,
      // use the fallback list so the scanner can still begin.
      if (this.activeTokens.size <= this.baseTokens.length) {
        this.getFallbackTokens()
          .filter(token => this.isSafeToken(token))
          .forEach(t => this.activeTokens.set(t.address, t));
      }
    }

    this.lastUpdate = now;
    console.log(`[TokenDiscovery] Safe token list retained and expanded (${this.activeTokens.size} tokens total).`);
    return Array.from(this.activeTokens.values());
  }

  public getActiveTokens(): TokenInfo[] {
    return Array.from(this.activeTokens.values());
  }

  public getTokenByMint(mint: string): TokenInfo | undefined {
    return this.activeTokens.get(mint);
  }

  private isBaseToken(address: string): boolean {
    return this.baseTokens.some(token => token.address === address);
  }

  /**
   * This is a safety filter, not a guarantee that a token cannot be a scam.
   * The strict Jupiter source removes most unverified tokens; the checks below
   * reject malformed metadata and common scam/junk markers before scanning.
   */
  private isSafeToken(token: Partial<TokenInfo>): token is TokenInfo {
    const record = token as JupiterTokenRecord;
    const symbol = typeof record.symbol === 'string' ? record.symbol.trim() : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const address = typeof (record.address || record.id) === 'string'
      ? (record.address || record.id)!.trim()
      : '';
    const decimals = token.decimals;
    const tags = Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === 'string').map(tag => tag.toLowerCase())
      : [];
    const searchableText = `${symbol} ${name}`.toLowerCase();
    const blockedMarkers = /\b(scam|fake|honeypot|malicious|rugpull|rug-pull|testnet|test token)\b/i;
    const blockedTags = new Set(['scam', 'unsafe', 'honeypot', 'malicious', 'rugpull', 'rug-pull', 'deprecated', 'fake']);

    return Boolean(
      address &&
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) &&
      symbol &&
      symbol.length <= 30 &&
      name.length <= 100 &&
      typeof decimals === 'number' &&
      Number.isInteger(decimals) &&
      decimals >= 0 &&
      decimals <= 18 &&
      record.isVerified === true &&
      record.audit?.isSus !== true &&
      typeof record.liquidity === 'number' &&
      record.liquidity >= CONFIG.MIN_TOKEN_LIQUIDITY_USD &&
      typeof record.organicScore === 'number' &&
      record.organicScore >= CONFIG.MIN_ORGANIC_SCORE &&
      !blockedMarkers.test(searchableText) &&
      !tags.some(tag => blockedTags.has(tag))
    );
  }

  private normalizeToken(record: JupiterTokenRecord): TokenInfo | null {
    const address = record.address || record.id;
    if (!address || !record.symbol || !record.decimals) return null;

    return {
      symbol: record.symbol.trim(),
      name: (record.name || record.symbol).trim(),
      address,
      decimals: record.decimals,
      logoURI: record.logoURI || record.icon,
      dailyVolume: record.stats24h?.volume,
      liquidityUSD: record.liquidity,
      organicScore: record.organicScore,
      isVerified: record.isVerified,
      tags: record.tags || []
    };
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
