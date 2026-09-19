export interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoURI?: string;
  dailyVolume?: number;
  tags?: string[];
}

export interface RouteSwapPlan {
  dexName: string;
  percent: number;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
}

export interface JupiterSwapQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label?: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot?: number;
  timeTaken?: number;
}

export interface ArbitrageOpportunity {
  id: string;
  timestamp: number;
  type: 'CROSS_DEX' | 'TRIANGULAR';
  tokenA: TokenInfo;
  tokenB: TokenInfo;
  tokenC?: TokenInfo; // For triangular
  inputAmountLamports: number;
  inputAmountFormatted: number;
  outputAmountLamports: number;
  outputAmountFormatted: number;
  grossProfitSOL: number;
  estimatedFeeSOL: number;
  netProfitSOL: number;
  netProfitPercent: number;
  buyDEX: string;
  sellDEX: string;
  routeSummary: string[];
  jupiterSwapLink: string;
}

export interface BotState {
  isScanning: boolean;
  minProfitPercent: number;
  scanIntervalMs: number;
  tradeAmountSOL: number;
  activeTokensCount: number;
  signalsDetectedCount: number;
  lastScanTimestamp: number;
  discoveredTokens: TokenInfo[];
}
