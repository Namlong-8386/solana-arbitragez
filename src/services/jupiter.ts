import axios from 'axios';
import { CONFIG } from '../config';
import { JupiterSwapQuote, TokenInfo } from '../types/arbitrage';

export class JupiterService {
  private nextRequestAt = 0;
  private rateLimitUntil = 0;
  private lastRateLimitLogAt = 0;

  public getRetryAfterMs(): number {
    return Math.max(0, this.rateLimitUntil - Date.now());
  }

  public isRateLimited(): boolean {
    return this.getRetryAfterMs() > 0;
  }

  /**
   * Get Swap Quote from Jupiter API v6
   */
  public async getQuote(
    inputMint: string,
    outputMint: string,
    amountLamports: number,
    slippageBps: number = 50
  ): Promise<JupiterSwapQuote | null> {
    try {
      await this.waitForRequestSlot();
      const url = `${CONFIG.JUPITER_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${slippageBps}`;
      const response = await axios.get<JupiterSwapQuote>(url, {
        timeout: 4000,
        headers: CONFIG.JUPITER_API_KEY ? { 'x-api-key': CONFIG.JUPITER_API_KEY } : undefined
      });
      return response.data;
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        console.warn('[Jupiter] This API endpoint requires a valid JUPITER_API_KEY in Replit Secrets.');
      } else if (status === 429) {
        this.rateLimitUntil = Date.now() + CONFIG.JUPITER_RATE_LIMIT_BACKOFF_MS;
        if (Date.now() - this.lastRateLimitLogAt > CONFIG.JUPITER_RATE_LIMIT_BACKOFF_MS) {
          console.warn(`[Jupiter] Rate limited; pausing quote requests for ${CONFIG.JUPITER_RATE_LIMIT_BACKOFF_MS}ms.`);
          this.lastRateLimitLogAt = Date.now();
        }
      } else if (status >= 500) {
        console.warn(`[Jupiter] Quote request failed (${status}) for ${inputMint.slice(0, 6)}... -> ${outputMint.slice(0, 6)}...`);
      }
      return null;
    }
  }

  private async waitForRequestSlot(): Promise<void> {
    const waitMs = Math.max(
      0,
      this.nextRequestAt - Date.now(),
      this.rateLimitUntil - Date.now()
    );

    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    this.nextRequestAt = Date.now() + CONFIG.JUPITER_MIN_REQUEST_INTERVAL_MS;
  }

  /**
   * Extract DEX venue labels from Jupiter route plan
   * Labels include: Raydium, Raydium CLMM, Orca Whirlpool, Meteora, Phoenix, Lifinity, OpenBook, FluxBeam, GooseFX, Sanctum, Saber, etc.
   */
  public extractDexLabels(quote: JupiterSwapQuote): string[] {
    const dexes: string[] = [];
    if (quote && quote.routePlan && Array.isArray(quote.routePlan)) {
      for (const step of quote.routePlan) {
        if (step.swapInfo && step.swapInfo.label) {
          dexes.push(step.swapInfo.label);
        }
      }
    }
    return dexes.length > 0 ? dexes : ['Jupiter Multi-DEX'];
  }

  /**
   * Generate direct 1-click swap link for Telegram user
   */
  public generateSwapLink(inputMint: string, outputMint: string, amountSOL: number): string {
    return `https://jup.ag/swap/${inputMint}-${outputMint}?inAmount=${amountSOL}`;
  }
}

export const jupiterService = new JupiterService();
