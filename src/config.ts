import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const CONFIG = {
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  ADMIN_ID: parseInt(process.env.ADMIN_ID || '7856143581', 10),
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  MIN_PROFIT_PERCENT: parseFloat(process.env.MIN_PROFIT_PERCENT || '0.3'),
  SCAN_INTERVAL_MS: parseInt(process.env.SCAN_INTERVAL_MS || '3000', 10),
  MAX_DYNAMIC_TOKENS: parseInt(process.env.MAX_DYNAMIC_TOKENS || '25', 10),
  TRADE_AMOUNT_SOL: parseFloat(process.env.TRADE_AMOUNT_SOL || '1.0'),
  PRIORITY_FEE_LAMPORTS: parseInt(process.env.PRIORITY_FEE_LAMPORTS || '50000', 10),
  
  // Well known mints
  WRAPPED_SOL_MINT: 'So11111111111111111111111111111111111111112',
  USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT_MINT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  
  JUPITER_QUOTE_API: 'https://quote-api.jup.ag/v6/quote',
  JUPITER_TOKENS_API: 'https://token.jup.ag/strict',
  DEXSCREENER_SOLANA_API: 'https://api.dexscreener.com/latest/dex/tokens/'
};
