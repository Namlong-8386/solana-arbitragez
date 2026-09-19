import { EventEmitter } from 'events';
import { CONFIG } from '../config';
import { ArbitrageOpportunity, BotState, TokenInfo } from '../types/arbitrage';
import { jupiterService } from './jupiter';
import { solanaService } from './solana';
import { tokenDiscoveryService } from './tokenDiscovery';

export class ArbitrageScannerService extends EventEmitter {
  private isScanning: boolean = false;
  private minProfitPercent: number = CONFIG.MIN_PROFIT_PERCENT;
  private scanIntervalMs: number = CONFIG.SCAN_INTERVAL_MS;
  private tradeAmountSOL: number = CONFIG.TRADE_AMOUNT_SOL;
  private signalsDetectedCount: number = 0;
  private lastScanTimestamp: number = 0;
  private timerId: NodeJS.Timeout | null = null;
  private recentOpportunityIds: Set<string> = new Set();

  constructor() {
    super();
  }

  public async startScanner(): Promise<void> {
    if (this.isScanning) return;
    this.isScanning = true;
    console.log('[ArbitrageScanner] Automated Scanner Started 24/7.');
    this.scanLoop();
  }

  public stopScanner(): void {
    this.isScanning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    console.log('[ArbitrageScanner] Scanner stopped.');
  }

  public setMinProfitPercent(percent: number): void {
    this.minProfitPercent = percent;
    console.log(`[ArbitrageScanner] Min Profit Threshold updated to ${percent}%`);
  }

  public setScanInterval(intervalMs: number): void {
    this.scanIntervalMs = intervalMs;
    console.log(`[ArbitrageScanner] Scan interval updated to ${intervalMs}ms`);
  }

  public setTradeAmount(sol: number): void {
    this.tradeAmountSOL = sol;
    console.log(`[ArbitrageScanner] Base Trade Amount set to ${sol} SOL`);
  }

  public getBotState(): BotState {
    return {
      isScanning: this.isScanning,
      minProfitPercent: this.minProfitPercent,
      scanIntervalMs: this.scanIntervalMs,
      tradeAmountSOL: this.tradeAmountSOL,
      activeTokensCount: tokenDiscoveryService.getActiveTokens().length,
      signalsDetectedCount: this.signalsDetectedCount,
      lastScanTimestamp: this.lastScanTimestamp,
      discoveredTokens: tokenDiscoveryService.getActiveTokens()
    };
  }

  /**
   * Main scan loop
   */
  private async scanLoop(): Promise<void> {
    if (!this.isScanning) return;

    try {
      this.lastScanTimestamp = Date.now();
      // Ensure dynamic tokens are loaded
      const tokens = await tokenDiscoveryService.fetchDynamicTopTokens();
      
      // Perform scan pass across dynamic tokens
      await this.scanDynamicTokens(tokens);

    } catch (err: any) {
      console.error('[ArbitrageScanner] Error during scan loop:', err.message);
    } finally {
      if (this.isScanning) {
        this.timerId = setTimeout(() => this.scanLoop(), this.scanIntervalMs);
      }
    }
  }

  /**
   * Scan dynamic tokens for triangular & cross-DEX arbitrage routes
   */
  private async scanDynamicTokens(tokens: TokenInfo[]): Promise<void> {
    const solToken = tokenDiscoveryService.getTokenByMint(CONFIG.WRAPPED_SOL_MINT) || {
      symbol: 'SOL',
      name: 'Wrapped SOL',
      address: CONFIG.WRAPPED_SOL_MINT,
      decimals: 9
    };
    const usdcToken = tokenDiscoveryService.getTokenByMint(CONFIG.USDC_MINT) || {
      symbol: 'USDC',
      name: 'USD Coin',
      address: CONFIG.USDC_MINT,
      decimals: 6
    };

    const inputLamports = solanaService.solToLamports(this.tradeAmountSOL);

    // Pick a subset of target tokens dynamically to scan in this pass
    const targetTokens = tokens.filter(
      t => t.address !== CONFIG.WRAPPED_SOL_MINT && t.address !== CONFIG.USDC_MINT
    );

    for (const targetToken of targetTokens) {
      if (!this.isScanning) break;

      // 1. Check Triangular Route: SOL -> TargetToken -> USDC -> SOL
      await this.checkTriangularArbitrage(solToken, targetToken, usdcToken, inputLamports);

      // 2. Check Direct Cross-DEX Route on SOL -> TargetToken -> SOL
      await this.checkCrossDexArbitrage(solToken, targetToken, inputLamports);
      
      // Small pause to prevent hitting Jupiter API rate limit
      await new Promise(r => setTimeout(r, 200));
    }
  }

  /**
   * Check Triangular Arbitrage: Token A (SOL) -> Token B (Alt) -> Token C (USDC) -> Token A (SOL)
   */
  private async checkTriangularArbitrage(
    tokenA: TokenInfo,
    tokenB: TokenInfo,
    tokenC: TokenInfo,
    inputLamports: number
  ): Promise<void> {
    try {
      // Step 1: SOL -> Token B
      const quote1 = await jupiterService.getQuote(tokenA.address, tokenB.address, inputLamports);
      if (!quote1 || !quote1.outAmount) return;

      // Step 2: Token B -> USDC
      const amountB = parseInt(quote1.outAmount, 10);
      const quote2 = await jupiterService.getQuote(tokenB.address, tokenC.address, amountB);
      if (!quote2 || !quote2.outAmount) return;

      // Step 3: USDC -> SOL
      const amountC = parseInt(quote2.outAmount, 10);
      const quote3 = await jupiterService.getQuote(tokenC.address, tokenA.address, amountC);
      if (!quote3 || !quote3.outAmount) return;

      const outputLamports = parseInt(quote3.outAmount, 10);
      this.evaluateOpportunity(
        'TRIANGULAR',
        tokenA,
        tokenB,
        tokenC,
        inputLamports,
        outputLamports,
        [...jupiterService.extractDexLabels(quote1), ...jupiterService.extractDexLabels(quote2), ...jupiterService.extractDexLabels(quote3)]
      );
    } catch (e) {
      // ignore
    }
  }

  /**
   * Check Direct Cross-DEX split routes
   */
  private async checkCrossDexArbitrage(
    tokenA: TokenInfo,
    tokenB: TokenInfo,
    inputLamports: number
  ): Promise<void> {
    try {
      // Quote A -> B
      const quoteAB = await jupiterService.getQuote(tokenA.address, tokenB.address, inputLamports);
      if (!quoteAB || !quoteAB.outAmount) return;

      const amountB = parseInt(quoteAB.outAmount, 10);

      // Quote B -> A
      const quoteBA = await jupiterService.getQuote(tokenB.address, tokenA.address, amountB);
      if (!quoteBA || !quoteBA.outAmount) return;

      const outputLamports = parseInt(quoteBA.outAmount, 10);
      const dexes = [...jupiterService.extractDexLabels(quoteAB), ...jupiterService.extractDexLabels(quoteBA)];

      this.evaluateOpportunity(
        'CROSS_DEX',
        tokenA,
        tokenB,
        undefined,
        inputLamports,
        outputLamports,
        dexes
      );
    } catch (e) {
      // ignore
    }
  }

  /**
   * Evaluate arbitrage opportunity against net profit threshold
   */
  private evaluateOpportunity(
    type: 'CROSS_DEX' | 'TRIANGULAR',
    tokenA: TokenInfo,
    tokenB: TokenInfo,
    tokenC: TokenInfo | undefined,
    inputLamports: number,
    outputLamports: number,
    dexes: string[]
  ): void {
    const inputSOL = solanaService.lamportsToSol(inputLamports);
    const outputSOL = solanaService.lamportsToSol(outputLamports);
    const grossProfitSOL = outputSOL - inputSOL;

    // Estimate network fees + priority fees (approx 0.0003 - 0.0008 SOL)
    const estimatedFeeSOL = solanaService.lamportsToSol(CONFIG.PRIORITY_FEE_LAMPORTS * 3);
    const netProfitSOL = grossProfitSOL - estimatedFeeSOL;
    const netProfitPercent = (netProfitSOL / inputSOL) * 100;

    if (netProfitPercent >= this.minProfitPercent) {
      const uniqueDexes = Array.from(new Set(dexes));
      const buyDEX = uniqueDexes[0] || 'Raydium';
      const sellDEX = uniqueDexes[1] || uniqueDexes[0] || 'Orca Whirlpool';

      const opportunityId = `${type}_${tokenB.symbol}_${Math.floor(Date.now() / 10000)}`;

      // Deduplicate signals within 10 seconds
      if (this.recentOpportunityIds.has(opportunityId)) return;
      this.recentOpportunityIds.add(opportunityId);
      setTimeout(() => this.recentOpportunityIds.delete(opportunityId), 10000);

      this.signalsDetectedCount++;

      const opportunity: ArbitrageOpportunity = {
        id: opportunityId,
        timestamp: Date.now(),
        type,
        tokenA,
        tokenB,
        tokenC,
        inputAmountLamports: inputLamports,
        inputAmountFormatted: inputSOL,
        outputAmountLamports: outputLamports,
        outputAmountFormatted: outputSOL,
        grossProfitSOL,
        estimatedFeeSOL,
        netProfitSOL,
        netProfitPercent,
        buyDEX,
        sellDEX,
        routeSummary: uniqueDexes,
        jupiterSwapLink: jupiterService.generateSwapLink(tokenA.address, tokenB.address, inputSOL)
      };

      console.log(`[ArbitrageScanner] 🚀 SIGNAL DISCOVERED! ${tokenB.symbol} -> Net Profit: +${netProfitPercent.toFixed(2)}% (${netProfitSOL.toFixed(5)} SOL)`);
      
      // Emit signal event for Telegram bot
      this.emit('signal', opportunity);
    }
  }
}

export const arbitrageScannerService = new ArbitrageScannerService();
