/**
 * 個別株詳細ページ用JavaScript
 * Chart.js + 予測表示 + テクニカル指標
 */

class StockDetail {
    constructor() {
        this.symbol = null;
        this.stockData = null;
        this.chart = null;
        this.chartPeriod = '1d';
        
        // Chart.js動的ロード
        this.chartLoaded = false;
        
        this.init();
    }

    async init() {
        try {
            // URLからシンボル取得
            this.symbol = this.getSymbolFromURL();
            
            if (!this.symbol) {
                throw new Error('銘柄コードが指定されていません');
            }

            // データ読み込み
            await this.loadStockData();
            
            // Chart.js読み込み（遅延ロード）
            await this.loadChart();
            
            // UI描画
            this.renderStockInfo();
            this.renderPriceSection();
            this.renderPredictions();
            this.renderSignals();
            this.renderIndicators();
            await this.renderChart();
            this.loadRelatedStocks();
            
            // イベントリスナー設定
            this.setupEventListeners();
            
            // ローディング画面を隠す
            this.hideLoading();
            
        } catch (error) {
            console.error('StockDetail初期化エラー:', error);
            this.showError(error.message);
        }
    }

    getSymbolFromURL() {
        // ?s=AAPL 形式または /stocks/AAPL 形式に対応
        const params = new URLSearchParams(window.location.search);
        const querySymbol = params.get('s');
        
        if (querySymbol) {
            return querySymbol;
        }
        
        // パスから取得 (/stocks/AAPL)
        const pathParts = window.location.pathname.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        
        if (lastPart && lastPart !== 'stocks' && lastPart !== '') {
            return lastPart;
        }
        
        return null;
    }

    async loadStockData() {
        try {
            // 1. major_indices.json から検索（指数・主要ETF）
            const indicesRes = await fetch('/api/major_indices.json');
            if (indicesRes.ok) {
                const data = await indicesRes.json();
                const stockList = [];
                if (data.indices) {
                    Object.values(data.indices).forEach(region => {
                        Object.values(region).forEach(stock => {
                            stockList.push(stock);
                        });
                    });
                }
                const stock = stockList.find(s => s.symbol === this.symbol);
                if (stock) {
                    this.stockData = stock;
                    return;
                }
            }

            // 2. realtime_prices.json から検索（日本株・前日比・タイムスタンプ正確）
            const realtimeRes = await fetch('/data/realtime_prices.json');
            if (realtimeRes.ok) {
                const realtimeData = await realtimeRes.json();
                const allStocks = [
                    ...(realtimeData.indices || []),
                    ...(realtimeData.sector_etfs || []),
                    ...(realtimeData.commodity_etfs || []),
                    ...(realtimeData.foreign || []),
                    ...(realtimeData.japanese_stocks || []),
                ];
                const rt = allStocks.find(s => s.ticker === this.symbol);
                if (rt) {
                    this.stockData = {
                        symbol: rt.ticker,
                        name: rt.name,
                        price: rt.current_price,
                        change: rt.change || 0,
                        change_percent: rt.change_percent || 0,
                        volume: rt.volume || 0,
                        market_cap: rt.market_cap || 0,
                        trailing_pe: rt.trailing_pe || 0,
                        forward_pe: rt.forward_pe || 0,
                        dividend_yield: rt.dividend_yield || 0,
                        price_to_book: rt.price_to_book || 0,
                        fifty_two_week_high: rt.fifty_two_week_high || 0,
                        fifty_two_week_low: rt.fifty_two_week_low || 0,
                        ma5: rt.ma5 || 0,
                        ma25: rt.ma25 || 0,
                        ma75: rt.ma75 || 0,
                        updatedAt: rt.timestamp,
                    };
                    return;
                }
            }

            // 3. stocks/index.json から検索（上記にない銘柄）
            const stocksRes = await fetch('/api/stocks/index.json');
            if (!stocksRes.ok) throw new Error(`データ取得エラー: ${stocksRes.status}`);
            const stocksData = await stocksRes.json();
            const found = (stocksData.stocks || []).find(s => s.symbol === this.symbol);
            if (!found) throw new Error(`銘柄 "${this.symbol}" が見つかりません`);

            this.stockData = {
                symbol: found.symbol,
                name: found.name !== found.symbol ? found.name : found.symbol,
                price: found.price,
                change: found.change || 0,
                change_percent: found.change_pct || 0,
                volume: found.volume || 0,
                market_cap: found.market_cap || 0,
                trailing_pe: found.pe_ratio || 0,
                dividend_yield: found.dividend_yield || 0,
                fifty_two_week_high: found.week52_high || 0,
                fifty_two_week_low: found.week52_low || 0,
            };

        } catch (error) {
            console.error('株価データ読み込みエラー:', error);
            throw error;
        }
    }

    async loadChart() {
        if (this.chartLoaded) return;
        
        try {
            // Chart.jsをCDNから動的読み込み
            if (!window.Chart) {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js';
                
                await new Promise((resolve, reject) => {
                    script.onload = resolve;
                    script.onerror = () => reject(new Error('Chart.js読み込み失敗'));
                    document.head.appendChild(script);
                });
            }
            
            this.chartLoaded = true;
            console.log('Chart.js読み込み完了');
            
        } catch (error) {
            console.error('Chart.js読み込みエラー:', error);
            // Chart.jsなしでも続行
        }
    }

    renderStockInfo() {
        const data = this.stockData;
        
        // ヘッダー情報
        document.getElementById('stock-name').textContent = data.name || this.symbol;
        document.getElementById('stock-symbol').textContent = data.symbol || this.symbol;
        document.getElementById('stock-symbol-breadcrumb').textContent = data.symbol || this.symbol;
        
        // メタ情報
        const marketBadge = document.getElementById('stock-market');
        const market = this.detectMarket(this.symbol);
        marketBadge.textContent = this.getMarketLabel(market);
        marketBadge.className = `market-badge ${market}`;
        
        const tierBadge = document.getElementById('stock-tier');
        const tier = data.tier || 'other';
        tierBadge.textContent = this.getTierLabel(tier);
        tierBadge.className = `tier-badge ${tier}`;
        
        // 更新時刻
        const updatedEl = document.getElementById('stock-updated');
        if (data.updatedAt) {
            const date = new Date(data.updatedAt);
            updatedEl.textContent = `更新時刻: ${date.toLocaleString('ja-JP')} JST`;
        }
        
        // ウォッチリスト状態
        this.updateWatchlistButton();
    }

    renderPriceSection() {
        const data = this.stockData;
        const market = this.detectMarket(this.symbol);
        
        // 現在価格
        document.getElementById('current-price').textContent = 
            this.formatPrice(data.price, market);
        
        // 価格変動
        const changeEl = document.getElementById('price-change');
        const changeValue = changeEl.querySelector('.change-value');
        const changePercent = changeEl.querySelector('.change-percent');
        
        changeValue.textContent = this.formatChange(data.change);
        changePercent.textContent = `(${this.formatPercent(data.change_percent)})`;
        
        // 変動クラス
        changeEl.className = 'price-change';
        const changeClass = this.getChangeClass(data.change);
        changeEl.classList.add(changeClass);
        
        // 指標
        document.getElementById('prev-close').textContent = 
            this.formatPrice(data.price - (data.change || 0), market);
        document.getElementById('volume').textContent = 
            this.formatVolume(data.volume);
        
        // 52週高安（データがある場合）
        if (data.fifty_two_week_high) {
            document.getElementById('week52-high').textContent = 
                this.formatPrice(data.fifty_two_week_high, market);
        }
        if (data.fifty_two_week_low) {
            document.getElementById('week52-low').textContent = 
                this.formatPrice(data.fifty_two_week_low, market);
        }
    }

    renderPredictions() {
        const predictions = this.stockData.predictions;
        if (!predictions) {
            document.querySelector('.prediction-section').style.display = 'none';
            return;
        }

        const market = this.detectMarket(this.symbol);

        // アンサンブル予測
        if (predictions.ensemble) {
            document.getElementById('ensemble-prediction').textContent = 
                this.formatPrice(predictions.ensemble.value, market);
            document.getElementById('ensemble-confidence').textContent = 
                `信頼度: ${(predictions.ensemble.confidence * 100).toFixed(1)}%`;
        }

        // 各手法の予測
        const methods = [
            { key: 'moving_avg', id: 'ma' },
            { key: 'linear_reg', id: 'lr' },
            { key: 'momentum', id: 'momentum' },
            { key: 'bbands', id: 'bb' }
        ];

        methods.forEach(({ key, id }) => {
            if (predictions[key]) {
                const predEl = document.getElementById(`${id}-prediction`);
                const confEl = document.getElementById(`${id}-confidence`);
                
                if (predEl) {
                    predEl.textContent = this.formatPrice(predictions[key].value, market);
                }
                if (confEl) {
                    confEl.textContent = `${(predictions[key].confidence * 100).toFixed(1)}%`;
                }
            }
        });
    }

    renderSignals() {
        const prediction = this.stockData.prediction;
        if (!prediction || !prediction.signal_details || Object.keys(prediction.signal_details).length === 0) return;

        const section = document.getElementById('signal-section');
        const summary = document.getElementById('signal-summary');
        const grid = document.getElementById('signal-grid');
        if (!section || !summary || !grid) return;

        const details = prediction.signal_details;
        const count = prediction.signal_count || {};
        const pos = count.positive || 0;
        const neg = count.negative || 0;
        const total = count.total || Object.keys(details).length;

        // サマリーバー
        const trendLabel = pos > neg ? '上昇優勢' : (neg > pos ? '下降優勢' : '中立');
        const trendColor = pos > neg ? '#10b981' : (neg > pos ? '#ef4444' : '#6b7280');
        summary.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <span style="font-weight:700;color:${trendColor};font-size:1.1rem;">${trendLabel}</span>
                <span style="color:#6b7280;font-size:14px;">陽性 ${pos} / 中立 ${total - pos - neg} / 陰性 ${neg}</span>
                <div style="flex:1;min-width:120px;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
                    <div style="height:100%;width:${total > 0 ? (pos/total*100) : 0}%;background:#10b981;border-radius:4px;"></div>
                </div>
            </div>`;

        // シグナルカード
        const signalIcons = { 1: '✅', 0: '➡️', '-1': '❌' };
        const signalColors = { 1: '#d1fae5', 0: '#f3f4f6', '-1': '#fee2e2' };
        const signalBorders = { 1: '#10b981', 0: '#d1d5db', '-1': '#ef4444' };

        grid.innerHTML = Object.entries(details).map(([key, s]) => {
            const v = String(s.value);
            return `<div style="background:${signalColors[v]||'#f3f4f6'};border:1px solid ${signalBorders[v]||'#d1d5db'};border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:10px;">
                <span style="font-size:18px;">${signalIcons[v]||'➡️'}</span>
                <div>
                    <div style="font-weight:600;font-size:14px;color:#1f2937;">${s.label}</div>
                    <div style="font-size:12px;color:#6b7280;">${s.detail}</div>
                </div>
            </div>`;
        }).join('');

        section.style.display = 'block';
    }

    renderIndicators() {
        const indicators = this.stockData.indicators;
        if (!indicators) {
            document.querySelector('.indicators-section').style.display = 'none';
            return;
        }

        // RSI
        if (indicators.rsi !== undefined) {
            const rsi = indicators.rsi;
            document.getElementById('rsi-value').textContent = rsi.toFixed(1);
            
            const rsiBar = document.getElementById('rsi-bar');
            rsiBar.style.width = `${rsi}%`;
            
            // RSI色分け
            if (rsi > 70) {
                rsiBar.style.background = '#f59e0b'; // オレンジ（売られすぎ）
            } else if (rsi < 30) {
                rsiBar.style.background = '#10b981'; // グリーン（買われすぎ）
            } else {
                rsiBar.style.background = 'var(--accent-color)';
            }
        }

        // 移動平均
        if (indicators.ma20 !== undefined) {
            const market = this.detectMarket(this.symbol);
            document.getElementById('ma20-value').textContent = 
                this.formatPrice(indicators.ma20, market);
            
            const currentPrice = parseFloat(this.stockData.price);
            const ma20 = indicators.ma20;
            
            let signal = '';
            if (currentPrice > ma20 * 1.02) {
                signal = '🔼 強気';
            } else if (currentPrice < ma20 * 0.98) {
                signal = '🔽 弱気';
            } else {
                signal = '➡️ 中立';
            }
            
            document.getElementById('ma20-signal').textContent = signal;
        }

        // ボリンジャーバンド
        if (indicators.bb_position !== undefined) {
            const position = (indicators.bb_position * 100).toFixed(1);
            document.getElementById('bb-position').textContent = `${position}%`;
            
            let bbSignal = '';
            if (indicators.bb_position > 0.8) {
                bbSignal = '⚠️ 上限近く';
            } else if (indicators.bb_position < 0.2) {
                bbSignal = '⚠️ 下限近く';
            } else {
                bbSignal = '📊 正常範囲';
            }
            
            document.getElementById('bb-signal').textContent = bbSignal;
        }

        // ボラティリティ
        if (indicators.volatility !== undefined) {
            const volatility = (indicators.volatility * 100).toFixed(2);
            document.getElementById('volatility-value').textContent = `${volatility}%`;
            
            let volSignal = '';
            if (indicators.volatility > 0.05) {
                volSignal = '⚡ 高ボラ';
            } else if (indicators.volatility < 0.02) {
                volSignal = '😴 低ボラ';
            } else {
                volSignal = '📈 通常';
            }
            
            document.getElementById('volatility-signal').textContent = volSignal;
        }
    }

    async renderChart() {
        if (!this.chartLoaded || !window.Chart) {
            // Chart.jsが読み込まれていない場合は簡易表示
            const chartContainer = document.querySelector('.chart-container');
            chartContainer.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 400px; background: var(--card-separator-color); border-radius: 8px;">
                    <p style="color: var(--card-text-color-secondary);">チャートを準備中...</p>
                </div>
            `;
            return;
        }

        const canvas = document.getElementById('price-chart');
        const ctx = canvas.getContext('2d');

        // 期間に応じたデータを生成（初期表示は1日）
        const chartData = await this.generateChartDataForPeriod(this.chartPeriod);

        // チャートデータなしの場合はメッセージ表示
        if (!chartData) {
            const chartContainer = canvas.parentElement;
            chartContainer.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-secondary);flex-direction:column;gap:8px;">
                    <span style="font-size:2rem;">📊</span>
                    <span>この銘柄のチャートデータはまだ利用できません</span>
                </div>`;
            return;
        }

        const labels = chartData.labels;
        const prices = chartData.prices;

        // チャート作成
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: this.stockData.name || this.symbol,
                    data: prices,
                    borderColor: 'var(--accent-color)',
                    backgroundColor: 'rgba(0, 122, 204, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: this.getChartTitle(this.chartPeriod),
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: (context) => {
                                const market = this.detectMarket(this.symbol);
                                const currency = market === 'JP' ? '¥' : '$';
                                return `${context.dataset.label}: ${currency}${context.parsed.y.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: this.getXAxisTitle(this.chartPeriod)
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: '価格'
                        },
                        ticks: {
                            callback: (value) => {
                                const market = this.detectMarket(this.symbol);
                                const currency = market === 'JP' ? '¥' : '$';
                                return currency + value.toLocaleString();
                            }
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    setupEventListeners() {
        // チャート期間切り替え
        document.querySelectorAll('.chart-period').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                // アクティブ状態更新
                document.querySelectorAll('.chart-period').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.chartPeriod = btn.dataset.period;
                await this.updateChart();
            });
        });

        // ウォッチリストボタン
        const watchlistBtn = document.getElementById('watchlist-toggle');
        watchlistBtn?.addEventListener('click', () => {
            this.toggleWatchlist();
        });
    }

    async updateChart() {
        if (!this.chart) return;

        console.log(`チャート期間変更: ${this.chartPeriod}`);

        // 期間に応じたデータを生成
        const chartData = await this.generateChartDataForPeriod(this.chartPeriod);
        if (!chartData) return;

        // チャートデータを更新
        this.chart.data.labels = chartData.labels;
        this.chart.data.datasets[0].data = chartData.prices;
        
        // チャートタイトルを更新
        this.chart.options.plugins.title.text = this.getChartTitle(this.chartPeriod);
        
        // X軸タイトルを更新
        this.chart.options.scales.x.title.text = this.getXAxisTitle(this.chartPeriod);
        
        // チャートを再描画
        this.chart.update('active');
        
        console.log(`チャート更新完了: ${this.chartPeriod} (${chartData.labels.length}データ点)`);
    }

    /**
     * 期間に応じたチャートデータを生成
     */
    async generateChartDataForPeriod(period) {
        try {
            // 履歴データを取得
            const response = await fetch('/data/historical_data.json');
            if (response.ok) {
                const historicalData = await response.json();
                const symbolData = historicalData[this.symbol];
                
                // データがない場合は次の期間にフォールバック
                const fallbackOrder = ['1d', '1w', '1m', '3m', '1y'];
                const targetPeriod = symbolData && symbolData.periods && symbolData.periods[period]
                    ? period
                    : fallbackOrder.find(p => symbolData && symbolData.periods && symbolData.periods[p]);

                if (targetPeriod && symbolData.periods[targetPeriod]) {
                    const usePeriod = targetPeriod;
                    period = usePeriod;
                }

                if (symbolData && symbolData.periods && symbolData.periods[period]) {
                    const data = symbolData.periods[period];
                    const labels = data.map(item => {
                        if (period === '1d') {
                            // 1日データの場合は時刻を表示（timeフィールドがあれば使用、なければtimestampから生成）
                            return item.time || new Date(item.timestamp * 1000).toTimeString().slice(0, 5);
                        } else {
                            return item.date;
                        }
                    });
                    const prices = data.map(item => item.close);
                    
                    console.log(`実際の履歴データ使用: ${period} (${data.length}ポイント)`);
                    return { labels, prices };
                }
            }
        } catch (error) {
            console.warn('履歴データ取得失敗:', error);
        }

        // チャートデータなし → nullを返してチャートエリアにメッセージ表示
        return null;
    }

    /**
     * 模擬データ生成（履歴データが取得できない場合のフォールバック）
     */
    generateMockData(period) {
        const currentPrice = parseFloat(this.stockData.price) || 100;
        const labels = [];
        const prices = [];
        
        // 期間設定
        const periodConfig = {
            '1d': { days: 1, hours: 24, interval: 'hour' },
            '1w': { days: 7, hours: 0, interval: 'day' },
            '1m': { days: 30, hours: 0, interval: 'day' },
            '3m': { days: 90, hours: 0, interval: 'day' },
            '1y': { days: 365, hours: 0, interval: 'week' }
        };
        
        const config = periodConfig[period] || periodConfig['1d'];
        
        if (config.interval === 'hour') {
            // 1日の場合：時間単位のデータ
            for (let i = config.hours; i >= 0; i--) {
                const date = new Date();
                date.setHours(date.getHours() - i);
                
                if (date.getHours() >= 9 && date.getHours() <= 15) {
                    // 取引時間内のみ
                    labels.push(date.toTimeString().slice(0, 5));
                    const variation = (Math.random() - 0.5) * 0.02; // ±2%の変動
                    prices.push(currentPrice * (1 + variation));
                }
            }
        } else if (config.interval === 'day') {
            // 日単位のデータ
            for (let i = config.days; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                
                // 平日のみ（取引日）
                if (date.getDay() !== 0 && date.getDay() !== 6) {
                    labels.push(date.toISOString().split('T')[0]);
                    const variation = (Math.random() - 0.5) * 0.05; // ±5%の変動
                    prices.push(currentPrice * (1 + variation));
                }
            }
        } else if (config.interval === 'week') {
            // 週単位のデータ（1年間）
            for (let i = 52; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - (i * 7));
                
                labels.push(date.toISOString().split('T')[0]);
                const variation = (Math.random() - 0.5) * 0.1; // ±10%の変動
                prices.push(currentPrice * (1 + variation));
            }
        }
        
        // 最低限のデータポイントを保証
        if (labels.length === 0) {
            labels.push(new Date().toISOString().split('T')[0]);
            prices.push(currentPrice);
        }
        
        console.log(`模擬データ使用: ${period} (${labels.length}ポイント)`);
        return { labels, prices };
    }

    /**
     * 期間に応じたチャートタイトルを生成
     */
    getChartTitle(period) {
        const periodLabels = {
            '1d': '1日間',
            '1w': '1週間',
            '1m': '1ヶ月',
            '3m': '3ヶ月',
            '1y': '1年間'
        };
        
        const label = periodLabels[period] || '1日間';
        const stockName = this.stockData?.name || this.symbol;
        
        return `${stockName} - ${label}の価格推移`;
    }

    /**
     * 期間に応じたX軸タイトルを生成
     */
    getXAxisTitle(period) {
        const axisLabels = {
            '1d': '時刻',
            '1w': '日付',
            '1m': '日付', 
            '3m': '日付',
            '1y': '日付'
        };
        
        return axisLabels[period] || '日付';
    }

    async loadRelatedStocks() {
        try {
            // 同市場の銘柄を関連銘柄として表示（簡易版）
            const market = this.detectMarket(this.symbol);
            const response = await fetch('/api/major_indices.json');
            
            if (response.ok) {
                const data = await response.json();
                
                // indicesオブジェクトから全ての銘柄を収集
                const allStocks = [];
                if (data.indices) {
                    Object.values(data.indices).forEach(region => {
                        Object.values(region).forEach(stock => {
                            allStocks.push(stock);
                        });
                    });
                }
                
                const relatedStocks = allStocks
                    .filter(stock => 
                        this.detectMarket(stock.symbol) === market && 
                        stock.symbol !== this.symbol
                    )
                    .slice(0, 4); // 最大4銘柄
                
                this.renderRelatedStocks(relatedStocks);
            }
        } catch (error) {
            console.error('関連銘柄取得エラー:', error);
        }
    }

    renderRelatedStocks(stocks) {
        const container = document.getElementById('related-stocks');
        if (!container || stocks.length === 0) return;

        container.innerHTML = stocks.map(stock => `
            <div class="related-stock-card" onclick="window.location.href='/stocks/?s=${stock.symbol}'">
                <div style="font-weight: 600; margin-bottom: 4px;">${stock.name || stock.symbol}</div>
                <div style="font-family: monospace; color: var(--accent-color); font-size: 0.9rem;">${stock.symbol}</div>
                <div style="color: var(--card-text-color-secondary); font-size: 0.8rem;">
                    ${this.formatPrice(stock.price, this.detectMarket(stock.symbol))}
                </div>
            </div>
        `).join('');
    }

    updateWatchlistButton() {
        const button = document.getElementById('watchlist-toggle');
        if (!button) return;

        try {
            const watchlist = JSON.parse(localStorage.getItem('stock_watchlist') || '[]');
            const isWatched = watchlist.includes(this.symbol);
            
            button.classList.toggle('active', isWatched);
            button.querySelector('.watchlist-text').textContent = 
                isWatched ? 'ウォッチ中' : 'ウォッチリスト';
                
        } catch (error) {
            console.error('ウォッチリスト状態取得エラー:', error);
        }
    }

    toggleWatchlist() {
        try {
            let watchlist = JSON.parse(localStorage.getItem('stock_watchlist') || '[]');
            
            if (watchlist.includes(this.symbol)) {
                watchlist = watchlist.filter(s => s !== this.symbol);
            } else {
                watchlist.push(this.symbol);
            }
            
            localStorage.setItem('stock_watchlist', JSON.stringify(watchlist));
            this.updateWatchlistButton();
            
        } catch (error) {
            console.error('ウォッチリスト更新エラー:', error);
        }
    }

    hideLoading() {
        document.getElementById('loading-overlay').style.display = 'none';
        document.getElementById('stock-main-content').style.display = 'block';
    }

    showError(message) {
        document.getElementById('loading-overlay').style.display = 'none';
        document.getElementById('error-message').textContent = message;
        document.getElementById('error-overlay').style.display = 'flex';
    }

    // ユーティリティメソッド
    detectMarket(symbol) {
        // 日本市場の銘柄・指数
        const jpSymbols = ['^N225', '^TOPIX', '1321.T'];
        if (symbol.endsWith('.T') || jpSymbols.includes(symbol)) return 'JP';
        if (symbol.startsWith('^') || symbol.includes('=X')) return 'INDEX';
        if (/^[A-Z]{3,4}$/.test(symbol)) return 'US';
        if (symbol.includes('ETF') || symbol.includes('SPY') || symbol.includes('QQQ')) return 'ETF';
        return 'OTHER';
    }

    getMarketLabel(market) {
        const labels = {
            'JP': '🇯🇵 日本',
            'US': '🇺🇸 米国',
            'ETF': '📈 ETF',
            'INDEX': '📊 指数',
            'OTHER': 'その他'
        };
        return labels[market] || market;
    }

    getTierLabel(tier) {
        const labels = {
            'core': 'Core',
            'active': 'Active',
            'other': '-'
        };
        return labels[tier] || tier;
    }

    getChangeClass(change) {
        const num = parseFloat(change);
        if (num > 0) return 'positive';
        if (num < 0) return 'negative';
        return 'neutral';
    }

    formatPrice(price, market) {
        const num = parseFloat(price);
        if (isNaN(num)) return '---';
        
        const currency = market === 'JP' ? '¥' : '$';
        const digits = market === 'JP' ? 0 : 2;
        
        return currency + num.toLocaleString('ja-JP', {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits
        });
    }

    formatChange(change) {
        const num = parseFloat(change);
        if (isNaN(num)) return '---';
        
        const formatted = Math.abs(num).toLocaleString('ja-JP', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
        
        return num >= 0 ? `+${formatted}` : `-${formatted}`;
    }

    formatPercent(pct) {
        const num = parseFloat(pct);
        if (isNaN(num)) return '-%';
        
        return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
    }

    formatVolume(volume) {
        const num = parseInt(volume);
        if (isNaN(num) || num === 0) return '---';
        
        if (num >= 1e9) {
            return (num / 1e9).toFixed(1) + 'B';
        } else if (num >= 1e6) {
            return (num / 1e6).toFixed(1) + 'M';
        } else if (num >= 1e3) {
            return (num / 1e3).toFixed(1) + 'K';
        }
        return num.toLocaleString('ja-JP');
    }
}

// ページ読み込み完了後に初期化
document.addEventListener('DOMContentLoaded', () => {
    new StockDetail();
});