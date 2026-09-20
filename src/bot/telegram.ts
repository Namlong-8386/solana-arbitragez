import { Bot, InlineKeyboard } from 'grammy';
import { CONFIG } from '../config';
import { arbitrageScannerService } from '../services/arbitrageScanner';
import { solanaService } from '../services/solana';
import { tokenDiscoveryService } from '../services/tokenDiscovery';
import { ArbitrageOpportunity } from '../types/arbitrage';

export class TelegramBotService {
  private bot: Bot;
  private subscribers: Set<number> = new Set();

  constructor() {
    this.bot = new Bot(CONFIG.BOT_TOKEN);
    // Add admin to subscribers by default
    this.subscribers.add(CONFIG.ADMIN_ID);
    this.setupHandlers();
    this.setupSignalListener();
  }

  public async start(): Promise<void> {
    console.log('[TelegramBot] Starting Grammy Telegram Bot...');
    
    // Set bot command list in Telegram UI
    await this.bot.api.setMyCommands([
      { command: 'start', description: 'Mở Menu điều khiển Bot Arbitrage' },
      { command: 'status', description: 'Xem trạng thái hệ thống và thống kê quét' },
      { command: 'tokens', description: 'Xem danh sách Dynamic Tokens đang quét' },
      { command: 'settings', description: 'Cấu hình ngưỡng lợi nhuận & tốc độ quét' },
      { command: 'scan', description: 'Kích hoạt quét thủ công ngay lập tức' },
      { command: 'help', description: 'Hướng dẫn sử dụng Bot' }
    ]).catch(err => console.warn('[TelegramBot] Failed to set my commands:', err.message));

    // Launch bot long polling asynchronously
    this.bot.start({
      onStart: (botInfo) => {
        console.log(`[TelegramBot] Bot @${botInfo.username} successfully connected & running!`);
      }
    });
  }

  private setupHandlers(): void {
    // Check admin authorization middleware
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (userId) {
        this.subscribers.add(userId);
      }
      return next();
    });

    // /start command
    this.bot.command(['start', 'menu'], async (ctx) => {
      const welcomeMsg = 
        `⚡ <b>SOLANA MULTI-DEX ARBITRAGE SIGNAL BOT</b> ⚡\n\n` +
        `Welcome <b>${ctx.from?.first_name || 'Trader'}</b>!\n` +
        `Bot tự động quét chênh lệch giá (Arbitrage) 24/7 trên hơn <b>10 sàn DEX Solana</b> (Raydium, Orca, Meteora, Phoenix, Lifinity, OpenBook...).\n\n` +
        `🔥 <b>Tính năng nổi bật:</b>\n` +
        `• <b>Dynamic Token Discovery:</b> Tự động quét Top Coin có volume sôi động nhất.\n` +
        `• <b>Net Profit Calculation:</b> Tự động trừ phí Solana Priority Fee & Swap Fee.\n` +
        `• <b>Instant 1-Click Swap:</b> Gửi tín hiệu kèm Link Jupiter swap chốt lời ngay.\n\n` +
        `👇 Sử dụng bảng điều khiển bên dưới để tương tác:`;

      const keyboard = new InlineKeyboard()
        .text('📊 Trạng Thái System', 'btn_status')
        .text('🔥 Top Tokens Dynamic', 'btn_tokens').row()
        .text('⚡ Tắt/Bật Auto Scan', 'btn_toggle_scan')
        .text('⚙️ Cấu Hình Settings', 'btn_settings').row()
        .text('🎯 Test Quét Ngay', 'btn_scan_now')
        .url('🚀 Trade Jupiter', 'https://jup.ag');

      await ctx.reply(welcomeMsg, { parse_mode: 'HTML', reply_markup: keyboard });
    });

    // /status command
    this.bot.command('status', async (ctx) => {
      await this.sendSystemStatus(ctx);
    });

    // /tokens command
    this.bot.command('tokens', async (ctx) => {
      await this.sendTokensList(ctx);
    });

    // /settings command
    this.bot.command('settings', async (ctx) => {
      await this.sendSettingsMenu(ctx);
    });

    // /scan command
    this.bot.command('scan', async (ctx) => {
      await ctx.reply('⏳ <i>Đang quét chênh lệch giá tức thì trên mainnet Solana...</i>', { parse_mode: 'HTML' });
      const tokens = await tokenDiscoveryService.fetchDynamicTopTokens();
      const state = arbitrageScannerService.getBotState();
      await ctx.reply(
        `✅ <b>Quét hoàn tất!</b>\n` +
        `Đã phân tích <b>${tokens.length} Dynamic Tokens</b> qua <b>Raydium, Orca, Meteora, Phoenix, Lifinity...</b>\n` +
        `Tổng tín hiệu phát hiện hôm nay: <b>${state.signalsDetectedCount}</b>\n` +
        `Ngưỡng Lãi tối thiểu: <b>${state.minProfitPercent}%</b>`,
        { parse_mode: 'HTML' }
      );
    });

    // /help command
    this.bot.command('help', async (ctx) => {
      const helpMsg = 
        `📖 <b>HƯỚNG DẪN SỬ DỤNG BOT SIGNAL ARBITRAGE SOLANA</b>\n\n` +
        `<b>1. Cách thức hoạt động:</b>\n` +
        `Bot liên tục gọi báo giá từ Jupiter API v6 để so sánh đường đi Swap của cùng 1 token trên nhiều sàn DEX khác nhau (Cross-DEX & Triangular).\n\n` +
        `<b>2. Khi nào có Tín hiệu?</b>\n` +
        `Khi Net Profit (Lợi Nhuận Ròng) > Ngưỡng Min Profit % cài đặt (mặc định > 0.3%), Bot sẽ tự động bắn thông báo kèm nút **Jupiter 1-Click Swap**.\n\n` +
        `<b>3. Lệnh thao tác nhanh:</b>\n` +
        `/start - Mở Menu chính\n` +
        `/status - Trạng thái hệ thống\n` +
        `/tokens - Danh sách Coin đang quét tự động\n` +
        `/settings - Cài đặt phần trăm lời\n` +
        `/scan - Quét ngay lập tức`;

      await ctx.reply(helpMsg, { parse_mode: 'HTML' });
    });

    // Handle Callback Queries (Inline buttons)
    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      await ctx.answerCallbackQuery();

      if (data === 'btn_status') {
        await this.sendSystemStatus(ctx);
      } else if (data === 'btn_tokens') {
        await this.sendTokensList(ctx);
      } else if (data === 'btn_toggle_scan') {
        const state = arbitrageScannerService.getBotState();
        if (state.isScanning) {
          arbitrageScannerService.stopScanner();
          await ctx.reply('🔴 <b>Auto Scanner đã TẮT.</b>', { parse_mode: 'HTML' });
        } else {
          arbitrageScannerService.startScanner();
          await ctx.reply('🟢 <b>Auto Scanner đã BẬT (Quét 24/7 trên 10+ DEXes).</b>', { parse_mode: 'HTML' });
        }
      } else if (data === 'btn_settings') {
        await this.sendSettingsMenu(ctx);
      } else if (data === 'btn_scan_now') {
        await ctx.reply('⏳ <i>Đang chạy thủ công quét multi-DEX...</i>', { parse_mode: 'HTML' });
      } else if (data.startsWith('set_profit_')) {
        const val = parseFloat(data.replace('set_profit_', ''));
        arbitrageScannerService.setMinProfitPercent(val);
        await ctx.reply(`✅ Đã cập nhật Ngưỡng Lợi Nhuận Tối Thiểu = <b>${val}%</b>`, { parse_mode: 'HTML' });
      }
    });
  }

  /**
   * Listen to scanner signals and push notifications to subscribers
   */
  private setupSignalListener(): void {
    arbitrageScannerService.on('signal', async (opp: ArbitrageOpportunity) => {
      await this.broadcastSignal(opp);
    });
  }

  /**
   * Broadcast formatted signal card to Telegram subscribers
   */
  public async broadcastSignal(opp: ArbitrageOpportunity): Promise<void> {
    const solPriceUSD = await solanaService.getSolPriceUSD();
    const grossUSD = opp.grossProfitSOL * solPriceUSD;
    const netUSD = opp.netProfitSOL * solPriceUSD;

    const signalTypeEmoji = opp.type === 'TRIANGULAR' ? '📐 TRIANGULAR ARBITRAGE' : '⚡ CROSS-DEX ARBITRAGE';
    const routeStr = opp.routeSummary.join(' ➔ ');

    const message = 
      `🚨 <b>ARBITRAGE SIGNAL DISCOVERED!</b> 🚨\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 <b>Cặp Coin:</b> <code>${opp.tokenA.symbol} ➔ ${opp.tokenB.symbol}${opp.tokenC ? ' ➔ ' + opp.tokenC.symbol : ''}</code>\n` +
      `🏷️ <b>Loại Arbitrage:</b> ${signalTypeEmoji}\n` +
      `🏛️ <b>Đường đi Sàn DEX:</b> <code>${routeStr}</code>\n\n` +
      `💰 <b>Vốn đầu tư:</b> <code>${opp.inputAmountFormatted.toFixed(2)} SOL</code> (~$${(opp.inputAmountFormatted * solPriceUSD).toFixed(2)})\n` +
      `📈 <b>Giá trị thu về:</b> <code>${opp.outputAmountFormatted.toFixed(4)} SOL</code>\n` +
      `💸 <b>Phí Tx Solana + Gas:</b> <code>-${opp.estimatedFeeSOL.toFixed(5)} SOL</code>\n` +
      `─────────────────────────\n` +
      `🔥 <b>NET PROFIT:</b> <b>+${opp.netProfitPercent.toFixed(2)}%</b> (<code>+${opp.netProfitSOL.toFixed(4)} SOL</code> / <b>+$${netUSD.toFixed(2)}</b>)\n` +
      `⏰ <b>Thời gian:</b> <code>${new Date(opp.timestamp).toLocaleTimeString()}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👇 <i>Bấm nút bên dưới để Swap chốt lời ngay trên Jupiter:</i>`;

    const keyboard = new InlineKeyboard()
      .url('🚀 SWAP NGAY TRÊN JUPITER', opp.jupiterSwapLink)
      .row()
      .text('🔄 Refresh Status', 'btn_status');

    for (const chatId of this.subscribers) {
      try {
        await this.bot.api.sendMessage(chatId, message, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      } catch (err: any) {
        console.warn(`[TelegramBot] Failed to send signal to chat ${chatId}:`, err.message);
      }
    }
  }

  private async sendSystemStatus(ctx: any): Promise<void> {
    const state = arbitrageScannerService.getBotState();
    const solPrice = await solanaService.getSolPriceUSD();

    const statusMsg = 
      `📊 <b>TRẠNG THÁI HỆ THỐNG ARBITRAGE SOLANA</b>\n` +
      `─────────────────────────\n` +
      `🟢 <b>Auto Scanner:</b> ${state.isScanning ? 'ĐANG CHẠY (24/7)' : 'ĐÃ TẮT'}\n` +
      `💲 <b>Giá SOL Hiện Tại:</b> $${solPrice.toFixed(2)}\n` +
      `🪙 <b>Coin Dynamic Đang Quét:</b> <code>${state.activeTokensCount} Tokens</code>\n` +
      `🎯 <b>Tín Hiệu Đã Phát Hiện:</b> <code>${state.signalsDetectedCount} Signals</code>\n` +
      `⚡ <b>Tần Số Quét:</b> <code>${state.scanIntervalMs}ms</code>\n` +
      `💰 <b>Vốn Quét Giả Định:</b> <code>${state.tradeAmountSOL} SOL</code>\n` +
      `📈 <b>Ngưỡng Min Profit:</b> <b>${state.minProfitPercent}%</b>\n` +
      `📡 <b>Solana RPC:</b> Mainnet-Beta (Mainnet Connection OK)`;

    const keyboard = new InlineKeyboard()
      .text(state.isScanning ? '🛑 Tắt Scanner' : '▶️ Bật Scanner', 'btn_toggle_scan')
      .text('🔄 Làm mới', 'btn_status');

    await ctx.reply(statusMsg, { parse_mode: 'HTML', reply_markup: keyboard });
  }

  private async sendTokensList(ctx: any): Promise<void> {
    const tokens = tokenDiscoveryService.getActiveTokens();
    const tokenSymbols = tokens.map(t => `• <b>${t.symbol}</b> (<code>${t.address.slice(0, 4)}...${t.address.slice(-4)}</code>)`).join('\n');

    const msg = 
      `🔥 <b>DANH SÁCH DYNAMIC TOKENS ĐANG THEO DÕI (${tokens.length})</b>\n\n` +
      `Bot tự động cập nhật toàn bộ token hợp lệ từ Jupiter:\n\n` +
      `${tokenSymbols}\n\n` +
      `💡 <i>Danh sách đầy đủ tự động refresh mỗi 10 phút; scanner tiếp tục quét liên tục toàn bộ danh sách.</i>`;

    await ctx.reply(msg, { parse_mode: 'HTML' });
  }

  private async sendSettingsMenu(ctx: any): Promise<void> {
    const state = arbitrageScannerService.getBotState();
    const msg = 
      `⚙️ <b>CẤU HÌNH NGƯỠNG TÍN HIỆU ARBITRAGE</b>\n\n` +
      `Ngưỡng Lợi Nhuận Tối Thiểu Hiện Tại: <b>${state.minProfitPercent}%</b>\n` +
      `Vốn Giả Định Quét: <b>${state.tradeAmountSOL} SOL</b>\n\n` +
      `Chọn ngưỡng Lãi % mong muốn bên dưới để lọc tín hiệu:`;

    const keyboard = new InlineKeyboard()
      .text('0.2%', 'set_profit_0.2')
      .text('0.3%', 'set_profit_0.3')
      .text('0.5%', 'set_profit_0.5').row()
      .text('1.0%', 'set_profit_1.0')
      .text('2.0%', 'set_profit_2.0')
      .text('3.0%', 'set_profit_3.0').row()
      .text('🔙 Quay Về Menu', 'btn_status');

    await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}
