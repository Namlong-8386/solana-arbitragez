import { CONFIG } from './config';
import { TelegramBotService } from './bot/telegram';
import { arbitrageScannerService } from './services/arbitrageScanner';
import { tokenDiscoveryService } from './services/tokenDiscovery';

async function main() {
  console.log('===================================================');
  console.log('🚀 SOLANA AUTOMATED MULTI-DEX ARBITRAGE SIGNAL BOT');
  console.log('===================================================');
  console.log(`[Config] Admin ID: ${CONFIG.ADMIN_ID}`);
  console.log(`[Config] Solana RPC: ${CONFIG.SOLANA_RPC_URL}`);
  console.log(`[Config] Min Profit Threshold: ${CONFIG.MIN_PROFIT_PERCENT}%`);
  console.log(`[Config] Trade Amount: ${CONFIG.TRADE_AMOUNT_SOL} SOL`);

  // 1. Initialize Dynamic Token Auto-Discovery
  console.log('[Init] Fetching dynamic token list...');
  await tokenDiscoveryService.fetchDynamicTopTokens();

  // 2. Launch Telegram Bot
  const botService = new TelegramBotService();
  await botService.start();

  // 3. Start Automated Arbitrage Scanner
  await arbitrageScannerService.startScanner();

  console.log('✅ Bot and Scanner successfully initialized & running 24/7!');
}

process.on('uncaughtException', (err) => {
  console.error('[Fatal Error] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Fatal Error] Unhandled Rejection:', reason);
});

main().catch(err => {
  console.error('[Init Failed] Error starting application:', err);
});
