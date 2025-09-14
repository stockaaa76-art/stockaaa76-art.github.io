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
            this.renderIndicators();
            this.renderChart();
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
            const response = await fetch(`/api/stocks/${this.symbol}.json`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`銘柄 "${this.symbol}" が見つかりません`);
                }
                throw new Error(`データ取得エラー: ${response.status}`);
            }
            
            this.stockData = await response.json();
            console.log('株価データ読み込み完了:', this.symbol);
            
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
        changePercent.textContent = `(${this.formatPercent(data.pct)})`;
        
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
        if (data.week52_high) {
            document.getElementById('week52-high').textContent = 
                this.formatPrice(data.week52_high, market);
        }
        if (data.week52_low) {
            document.getElementById('week52-low').textContent = 
                this.formatPrice(data.week52_low, market);
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

    renderChart() {
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

        // 履歴データの準備
        const history = this.stockData.history || [];
        const labels = [];
        const prices = [];

        // データが配列の配列形式 [["2025-09-14", "3260"], ...] の場合
        history.forEach(item => {
            if (Array.isArray(item) && item.length >= 2) {
                labels.push(item[0]);
                prices.push(parseFloat(item[1]) || 0);
            } else if (typeof item === 'object' && item.date && item.price) {
                labels.push(item.date);
                prices.push(parseFloat(item.price) || 0);
            }
        });

        // サンプルデータ（履歴がない場合）
        if (labels.length === 0) {
            const currentPrice = parseFloat(this.stockData.price) || 100;
            for (let i = 30; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                labels.push(date.toISOString().split('T')[0]);
                
                // ランダムな価格変動を生成
                const variation = (Math.random() - 0.5) * 0.1;
                prices.push(currentPrice * (1 + variation));
            }
        }

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
                            text: '日付'
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
            btn.addEventListener('click', (e) => {
                // アクティブ状態更新
                document.querySelectorAll('.chart-period').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.chartPeriod = btn.dataset.period;
                this.updateChart();
            });
        });

        // ウォッチリストボタン
        const watchlistBtn = document.getElementById('watchlist-toggle');
        watchlistBtn?.addEventListener('click', () => {
            this.toggleWatchlist();
        });
    }

    updateChart() {
        if (!this.chart) return;

        // 期間に応じてデータを更新
        console.log(`チャート期間変更: ${this.chartPeriod}`);
        
        // TODO: 期間に応じた履歴データの再取得
        // 現在は同じデータを表示
    }

    async loadRelatedStocks() {
        try {
            // 同市場の銘柄を関連銘柄として表示（簡易版）
            const market = this.detectMarket(this.symbol);
            const response = await fetch('/api/stocks/index.json');
            
            if (response.ok) {
                const allStocks = await response.json();
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
        if (symbol.endsWith('.T')) return 'JP';
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