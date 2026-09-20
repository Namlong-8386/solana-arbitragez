import axios from 'axios';
import { CONFIG } from '../config';
import { JupiterSwapQuote, TokenInfo } from '../types/arbitrage';

export class JupiterService {
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
      const url = `${CONFIG.JUPITER_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${slippageBps}`;
      const response = await axios.get<JupiterSwapQuote>(url, { timeout: 4000 });
      return response.data;
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 429 || status >= 500) {
        console.warn(`[Jupiter] Quote request failed (${status}) for ${inputMint.slice(0, 6)}... -> ${outputMint.slice(0, 6)}...`);
      }
      return null;
    }
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
