/**
 * ダッシュボード用JavaScript
 * 日経・ダウの価格表示とスパークライン
 */

class Dashboard {
    constructor() {
        this.historical_api = '/data/historical_data.json';
        this.rankings_api = '/api/enhanced_rankings.json';
        this.extended_rankings_api = '/api/extended_rankings.json';
        this.enhanced_rankings_api = '/api/enhanced_rankings.json';
        this.period_rankings_api = '/api/period_rankings.json';
        this.ai_rankings_api = '/api/ai_rankings.json';
        this.currentRankingCategory = 'basic';
        this.currentPeriod = 'daily';
        this.jpViewMode = 'cards';           // P3: 'cards' | 'table'
        this.jpTableSort = { key: 'period_change', dir: 'desc' };  // P3 テーブルのソート状態
        this.usViewMode = 'cards';           // P3: 米国株 'cards' | 'table'
        this.usTableSort = { key: 'period_change', dir: 'desc' };
        this.usRawRows = [];                 // P3: 米国株テーブル用の生行（loadUSRankings で保持）
        this.init();
    }

    async init() {
        console.log('Dashboard初期化開始');
        try {
            console.log('historical_data から価格読み込み中...');
            await this.loadFromHistoricalData();
            await this.loadUSRankings();
            console.log('ランキングAPIを読み込み中...');
            await this.loadRankings();
            console.log('拡張ランキングAPIを読み込み中...');
            await this.loadExtendedRankings();
            console.log('期間別ランキングAPIを読み込み中...');
            await this.loadPeriodRankings();
            console.log('拡張ランキング（強化版）を読み込み中...');
            await this.loadEnhancedRankings();
            console.log('AI予測ランキングを読み込み中...');
            await this.loadAiRankings();
            await this.loadMarketVolume();
            await this.loadThemeCandidates();
            await this.loadMLRanking();
            await this.loadMLRanking('/api/ml_monthly_ranking_us.json', 'ml-ranking-us-list');
            this.setupEventListeners();
            
            // 初期描画後に再描画（Grid Layoutの初期化問題対策）
            setTimeout(() => {
                console.log('Canvas再描画実行');
                this.redrawAllCharts();
            }, 100);
            
            // 5分ごとに更新
            setInterval(() => {
                this.loadFromHistoricalData();
                this.loadUSRankings();
                this.loadRankings();
                this.loadExtendedRankings();
                this.loadPeriodRankings();
                this.loadEnhancedRankings();
                this.loadAiRankings();
                this.loadMarketVolume();
                this.loadThemeCandidates();
                this.loadMLRanking();
                this.loadMLRanking('/api/ml_monthly_ranking_us.json', 'ml-ranking-us-list');
            }, 5 * 60 * 1000);
            
        } catch (error) {
            console.error('Dashboard初期化エラー:', error);
            this.showError();
        }
    }

    async loadFromHistoricalData() {
        try {
            const res = await fetch(this.historical_api);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const hist = await res.json();

            // symbol → {price, change, change_percent, trend} に変換
            const toPrice = (symbol) => {
                const s = hist[symbol];
                if (!s || !s.history || s.history.length < 2) return null;
                const latest = s.history[s.history.length - 1];
                const prev   = s.history[s.history.length - 2];
                const change = (latest.close || 0) - (prev.close || 0);
                const pct    = prev.close ? change / prev.close * 100 : 0;
                return { ticker: symbol, current_price: latest.close, change, change_percent: pct,
                         trend: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
                         date: latest.date };
            };

            // 日経平均ヒーローカード
            const nikkei = toPrice('^N225');
            if (nikkei) {
                this.updateIndexCardFromRealtime('nikkei', nikkei);
                this.updateLastUpdated(nikkei.date);
            }

            // 国際指標マッピング
            const intlMap = {
                '^DJI': 'dow', '^IXIC': 'nasdaq', '^GSPC': 'sp500', '^RUT': 'russell',
                '^GDAXI': 'dax', '^FTSE': 'ftse', '^FCHI': 'cac', '^STOXX50E': 'stoxx',
                '000001.SS': 'shanghai', '^HSI': 'hangseng', '^KS11': 'kospi', '^TWII': 'taiwan',
                'CL=F': 'oil', 'GC=F': 'gold', 'SI=F': 'silver', 'BTC-USD': 'bitcoin'
            };
            const currencies = {
                '^DJI':'$','^IXIC':'$','^GSPC':'$','^RUT':'$',
                '^GDAXI':'€','^FTSE':'£','^FCHI':'€','^STOXX50E':'€',
                '^HSI':'HK$','^KS11':'₩','^TWII':'NT$',
                'CL=F':'$','GC=F':'$','SI=F':'$','BTC-USD':'$',
            };

            for (const [symbol, elId] of Object.entries(intlMap)) {
                const d = toPrice(symbol);
                if (!d) continue;
                const cur = currencies[symbol] || '¥';
                this.updateInternationalIndex(elId, {
                    price: d.current_price, change: d.change, change_percent: d.change_percent,
                    trend: d.trend, currency: cur,
                    price_formatted: cur + d.current_price.toLocaleString('en', {maximumFractionDigits:2}),
                    change_formatted: (d.change >= 0 ? '+' : '') + d.change.toFixed(2),
                });
                if (symbol === '^DJI') {
                    this.updateDowHeroFromIndices({
                        price: d.current_price, change: d.change, change_percent: d.change_percent, trend: d.trend,
                        price_formatted: '$' + d.current_price.toLocaleString('en', {maximumFractionDigits:2}),
                        change_formatted: (d.change >= 0 ? '+' : '') + d.change.toFixed(2),
                    });
                }
            }
        } catch (error) {
            console.error('historical_data 取得エラー:', error);
            // historical_data.json が単一ソース。取得失敗時はエラー表示のみ（staleな別ファイルを使わない）
            this.showError();
        }
    }

    updateInternationalIndices(data) {
        // 国際指標のマッピング
        const indexMapping = {
            // 米国
            '^IXIC': 'nasdaq',
            '^GSPC': 'sp500', 
            '^RUT': 'russell',
            // 欧州
            '^GDAXI': 'dax',
            '^FTSE': 'ftse',
            '^FCHI': 'cac',
            // アジア
            '000001.SS': 'shanghai',
            '^HSI': 'hangseng',
            '^KS11': 'kospi',
            // 商品
            'CL=F': 'oil',
            'GC=F': 'gold',
            'BTC-USD': 'bitcoin'
        };

        // すべての地域の指標を更新
        for (const [region, indices] of Object.entries(data.indices)) {
            for (const [symbol, indexData] of Object.entries(indices)) {
                const elementId = indexMapping[symbol];
                if (elementId) {
                    this.updateInternationalIndex(elementId, indexData);
                }
                // ダウ平均のヒーローカードも更新
                if (symbol === '^DJI') {
                    this.updateDowHeroFromIndices(indexData);
                }
            }
        }
    }

    updateDowHeroFromIndices(data) {
        const priceEl = document.getElementById('dow-price');
        const changeEl = document.getElementById('dow-change');
        const chartEl = document.getElementById('dow-chart');

        if (priceEl) {
            priceEl.textContent = data.price_formatted || this.formatPrice(data.price, '$');
        }

        if (changeEl) {
            const changeValue = changeEl.querySelector('.change-value');
            const changePercent = changeEl.querySelector('.change-percent');

            if (changeValue && changePercent) {
                changeValue.textContent = data.change_formatted || this.formatChange(data.change);
                changePercent.textContent = `(${this.formatPercent(data.change_percent)})`;

                changeEl.className = 'index-change';
                if (data.trend === 'up' || data.change > 0) {
                    changeEl.classList.add('positive');
                } else if (data.trend === 'down' || data.change < 0) {
                    changeEl.classList.add('negative');
                } else {
                    changeEl.classList.add('neutral');
                }
            }
        }

        if (chartEl) {
            this.drawSimpleSparkline(chartEl, data.change);
        }
    }

    updateInternationalIndex(elementId, data) {
        const priceEl = document.getElementById(`${elementId}-price`);
        const changeEl = document.getElementById(`${elementId}-change`);

        if (priceEl) {
            priceEl.textContent = data.price_formatted || this.formatPrice(data.price, data.currency);
        }

        if (changeEl) {
            const changeText = data.change_formatted || this.formatChange(data.change);
            const percentText = data.change_percent ? `(${this.formatPercent(data.change_percent)})` : '';
            changeEl.textContent = `${changeText} ${percentText}`;
            
            // 色分けクラス
            changeEl.className = 'index-change';
            if (data.trend === 'up' || data.change > 0) {
                changeEl.classList.add('positive');
            } else if (data.trend === 'down' || data.change < 0) {
                changeEl.classList.add('negative');
            } else {
                changeEl.classList.add('neutral');
            }
        }
    }

    updateIndexCardFromRealtime(prefix, data) {
        const priceEl = document.getElementById(`${prefix}-price`);
        const changeEl = document.getElementById(`${prefix}-change`);
        const chartEl = document.getElementById(`${prefix}-chart`);

        if (priceEl) {
            // 価格表示（3桁区切り）
            const formattedPrice = this.formatPrice(data.current_price, prefix === 'nikkei' ? '¥' : '$');
            priceEl.textContent = formattedPrice;
        }

        if (changeEl) {
            const changeValue = changeEl.querySelector('.change-value');
            const changePercent = changeEl.querySelector('.change-percent');
            
            if (changeValue && changePercent) {
                changeValue.textContent = this.formatChange(data.change);
                changePercent.textContent = `(${this.formatPercent(data.change_percent)})`;
                
                // 色分けクラス
                changeEl.className = 'index-change';
                if (data.change > 0) {
                    changeEl.classList.add('positive');
                } else if (data.change < 0) {
                    changeEl.classList.add('negative');
                } else {
                    changeEl.classList.add('neutral');
                }
            }
        }

        // スパークライン描画（簡易版：前日比のみでライン描画）
        if (chartEl) {
            this.drawSimpleSparkline(chartEl, data.change);
        }
    }

    updateIndexCard(prefix, data) {
        const priceEl = document.getElementById(`${prefix}-price`);
        const changeEl = document.getElementById(`${prefix}-change`);
        const chartEl = document.getElementById(`${prefix}-chart`);

        if (priceEl) {
            // 価格表示（3桁区切り）
            const formattedPrice = this.formatPrice(data.price, prefix === 'nikkei' ? '¥' : '$');
            priceEl.textContent = formattedPrice;
        }

        if (changeEl) {
            const changeValue = changeEl.querySelector('.change-value');
            const changePercent = changeEl.querySelector('.change-percent');
            
            if (changeValue && changePercent) {
                changeValue.textContent = this.formatChange(data.change);
                changePercent.textContent = `(${this.formatPercent(data.pct)})`;
                
                // 色分けクラス
                changeEl.className = 'index-change';
                if (data.change > 0) {
                    changeEl.classList.add('positive');
                } else if (data.change < 0) {
                    changeEl.classList.add('negative');
                } else {
                    changeEl.classList.add('neutral');
                }
            }
        }

        // スパークライン描画
        if (chartEl && data.spark && data.spark.length > 0) {
            this.drawSparkline(chartEl, data.spark);
        }
    }

    updateLastUpdated(timestamp) {
        const el = document.getElementById('last-updated');
        if (el) {
            const date = new Date(timestamp);
            const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000)); // JST変換
            el.textContent = `最終更新: ${this.formatDateTime(jstDate)} JST`;
        }
    }

    formatPrice(value, currency = '¥') {
        const num = parseFloat(value);
        if (isNaN(num)) return '---';
        
        return currency + num.toLocaleString('ja-JP', {
            minimumFractionDigits: currency === '¥' ? 0 : 2,
            maximumFractionDigits: currency === '¥' ? 2 : 2
        });
    }

    formatChange(value) {
        const num = parseFloat(value);
        if (isNaN(num)) return '---';
        
        return num.toLocaleString('ja-JP', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    }

    formatPercent(value) {
        const num = parseFloat(value);
        if (isNaN(num)) return '-%';
        
        return num.toFixed(2) + '%';
    }

    formatDateTime(date) {
        return date.toLocaleString('ja-JP', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Tokyo'
        });
    }

    drawSparkline(container, data) {
        const canvas = container.querySelector('canvas');
        if (!canvas) return;

        // Canvas のサイズを再設定（親要素に合わせる）
        const parentWidth = container.clientWidth;
        if (parentWidth > 0) {
            canvas.width = Math.min(parentWidth - 20, 280); // パディング考慮
            canvas.height = 60;
        }

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // キャンバスクリア
        ctx.clearRect(0, 0, width, height);

        if (data.length < 2) {
            // データ不足の場合
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
            ctx.stroke();
            ctx.setLineDash([]);
            return;
        }

        // データ正規化
        const values = data.map(d => typeof d === 'object' ? d.value : d);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;

        // パス作成
        ctx.beginPath();
        ctx.lineWidth = 2;
        
        // 色決定（最初と最後の値で判定）
        const firstValue = values[0];
        const lastValue = values[values.length - 1];
        
        if (lastValue > firstValue) {
            ctx.strokeStyle = '#10b981'; // 上昇 - グリーン
        } else if (lastValue < firstValue) {
            ctx.strokeStyle = '#f59e0b'; // 下降 - オレンジ
        } else {
            ctx.strokeStyle = '#6b7280'; // 変化なし - グレー
        }

        values.forEach((value, index) => {
            const x = (index / (values.length - 1)) * width;
            const y = height - ((value - min) / range) * height;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        // エンドポイント
        const lastX = width;
        const lastY = height - ((lastValue - min) / range) * height;
        
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(lastX, lastY, 2, 0, 2 * Math.PI);
        ctx.fill();
    }

    drawSimpleSparkline(container, changeValue) {
        const canvas = container.querySelector('canvas');
        if (!canvas) return;

        // Canvas のサイズを再設定
        const parentWidth = container.clientWidth;
        if (parentWidth > 0) {
            canvas.width = Math.min(parentWidth - 20, 280);
            canvas.height = 60;
        }

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // キャンバスクリア
        ctx.clearRect(0, 0, width, height);

        // 簡易トレンドライン（前日比から推測）
        ctx.lineWidth = 2;
        
        // 色決定
        if (changeValue > 0) {
            ctx.strokeStyle = '#10b981'; // 上昇 - グリーン
        } else if (changeValue < 0) {
            ctx.strokeStyle = '#f59e0b'; // 下降 - オレンジ
        } else {
            ctx.strokeStyle = '#6b7280'; // 変化なし - グレー
        }

        // 前日比に基づく簡易ライン
        ctx.beginPath();
        if (changeValue > 0) {
            // 上昇トレンド
            ctx.moveTo(0, height * 0.8);
            ctx.lineTo(width * 0.7, height * 0.3);
            ctx.lineTo(width, height * 0.2);
        } else if (changeValue < 0) {
            // 下降トレンド
            ctx.moveTo(0, height * 0.2);
            ctx.lineTo(width * 0.7, height * 0.7);
            ctx.lineTo(width, height * 0.8);
        } else {
            // フラット
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
        }
        
        ctx.stroke();

        // エンドポイント
        const endY = changeValue > 0 ? height * 0.2 : (changeValue < 0 ? height * 0.8 : height / 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(width, endY, 2, 0, 2 * Math.PI);
        ctx.fill();
    }

    // GA4 カスタムイベント送信ユーティリティ
    trackEvent(eventName, params = {}) {
        if (typeof gtag === 'function') {
            gtag('event', eventName, params);
        }
    }

    setupEventListeners() {
        // ウォッチリスト処理
        this.loadWatchlist();

        // ランキングタブのイベントリスナー
        this.setupRankingTabs();

        // 期間タブのイベントリスナー
        this.setupPeriodTabs();

        // IndexHeroのクリック処理
        document.querySelectorAll('.index-hero').forEach(hero => {
            hero.addEventListener('click', (e) => {
                if (e.target.tagName !== 'A') {
                    const detailLink = hero.querySelector('.btn-primary');
                    if (detailLink) {
                        const symbol = hero.dataset.symbol || detailLink.href.split('s=')[1];
                        this.trackEvent('index_hero_click', { symbol: symbol || 'unknown' });
                        window.location.href = detailLink.href;
                    }
                }
            });
        });
        
        // ウィンドウリサイズ時に再描画
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                console.log('リサイズ検知 - Canvas再描画');
                this.redrawAllCharts();
            }, 250);
        });
    }
    
    // すべてのチャートを再描画（Grid Layout初期化後のCanvas再描画用）
    redrawAllCharts() {
        // historical_data.json が単一ソース。再描画は再fetch で対応
        this.loadFromHistoricalData();
        this.loadMarketVolume();
    }

    // 新テーマ候補（市場全体スキャン W0・予測ユニバース外の急騰）
    async loadThemeCandidates() {
        const el = document.getElementById('theme-candidates-list');
        if (!el) return;
        try {
            const res = await fetch('/api/theme_candidates.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const cands = (data.candidates || []).slice(0, 15);
            if (cands.length === 0) {
                el.innerHTML = '<div class="no-data">本日はユニバース外の急騰なし</div>';
                return;
            }
            el.innerHTML = cands.map((c, i) => {
                const chg = c.change_1d || 0;
                const cls = chg > 0 ? 'positive' : chg < 0 ? 'negative' : 'neutral';
                const reasons = (c.detected_reasons || []).join(' / ');
                return `
                    <div class="ranking-item" onclick="window.location.href='/stocks/detail/?s=${encodeURIComponent(c.ticker)}'">
                        <div class="ranking-item-left">
                            <div class="ranking-symbol">${i + 1}. 🆕 ${c.ticker}</div>
                            <div class="ranking-name">${c.name}　<span style="opacity:.7">[${c.sector17 || ''}]</span></div>
                            <div class="ranking-name" style="font-size:.8em;opacity:.75">${reasons}</div>
                        </div>
                        <div class="ranking-item-right">
                            <div class="ranking-values">
                                <div class="ranking-value">¥${(c.current || 0).toLocaleString()}</div>
                                <div class="ranking-change ${cls}">${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%</div>
                            </div>
                        </div>
                    </div>`;
            }).join('');
        } catch (e) {
            el.innerHTML = '<div class="no-data">新テーマ候補データがありません</div>';
        }
    }

    // 今月の強い銘柄（クロスセクショナル・ランキングML）。JP/US 共通（url+要素ID切替）
    async loadMLRanking(url = '/api/ml_monthly_ranking.json', elId = 'ml-ranking-list') {
        const el = document.getElementById(elId);
        if (!el) return;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const top = (data.top || []).slice(0, 20);
            if (top.length === 0) {
                el.innerHTML = '<div class="no-data">ランキングデータがありません</div>';
                return;
            }
            el.innerHTML = top.map((r) => {
                const m = r.ret120_pct || 0;
                const cls = m > 0 ? 'positive' : m < 0 ? 'negative' : 'neutral';
                return `
                    <div class="ranking-item" onclick="window.location.href='/stocks/detail/?s=${encodeURIComponent(r.ticker)}'">
                        <div class="ranking-item-left">
                            <div class="ranking-symbol">${r.rank}. 🏅 ${r.ticker}</div>
                            <div class="ranking-name">${r.name}　<span style="opacity:.7">[${r.sector17 || ''}]</span></div>
                            <div class="ranking-name" style="font-size:.8em;opacity:.75">120日 ${m >= 0 ? '+' : ''}${m.toFixed(0)}% / RSI${(r.rsi || 0).toFixed(0)}</div>
                        </div>
                        <div class="ranking-item-right">
                            <div class="ranking-values">
                                <div class="ranking-value">AIスコア</div>
                                <div class="ranking-change ${cls}">${(r.score || 0).toFixed(2)}</div>
                            </div>
                        </div>
                    </div>`;
            }).join('');
        } catch (e) {
            el.innerHTML = '<div class="no-data">AIランキングデータがありません</div>';
        }
    }

    // 市場全体出来高（sentiment.json の market_volume）。既存 drawSparkline を再利用
    async loadMarketVolume() {
        try {
            const res = await fetch('/api/sentiment.json');
            if (!res.ok) return;
            const data = await res.json();
            const mv = data.market_volume || {};
            const volumes = mv.volumes || [];

            const ratioEl = document.getElementById('jp-volume-ratio');
            if (ratioEl) {
                ratioEl.textContent = (mv.latest_vs_ma25_pct != null) ? `${mv.latest_vs_ma25_pct}%` : '---';
            }
            const noteEl = document.getElementById('jp-volume-note');
            if (noteEl && mv.ticker_count) {
                noteEl.textContent = `25日平均比（${mv.ticker_count}銘柄合算）`;
            }

            const chartEl = document.getElementById('jp-volume-chart');
            if (chartEl && volumes.length >= 2) {
                this.drawSparkline(chartEl, volumes);
            }
        } catch (error) {
            console.error('市場全体出来高取得エラー:', error);
        }
    }

    loadWatchlist() {
        try {
            const watchlist = JSON.parse(localStorage.getItem('stock_watchlist') || '[]');
            this.renderWatchlist(watchlist);
        } catch (error) {
            console.error('ウォッチリスト読み込みエラー:', error);
        }
    }

    renderWatchlist(symbols) {
        const container = document.getElementById('watchlist-container');
        if (!container) return;

        if (symbols.length === 0) {
            container.innerHTML = `
                <div class="watchlist-empty">
                    <p>ウォッチリストが空です</p>
                    <a href="/stocks/" class="btn-secondary">銘柄を探す</a>
                </div>
            `;
            return;
        }

        // ウォッチリスト銘柄表示
        container.innerHTML = `
            <div class="watchlist-items">
                ${symbols.slice(0, 5).map(symbol => `
                    <div class="watchlist-item" data-symbol="${symbol}">
                        <span class="symbol">${symbol}</span>
                        <span class="price">読込中...</span>
                        <span class="change">---</span>
                    </div>
                `).join('')}
            </div>
        `;

        // ウォッチリスト銘柄の価格取得
        this.loadWatchlistPrices(symbols.slice(0, 5));
    }

    async loadWatchlistPrices(symbols) {
        // rankings.json（enhanced_rankings）からウォッチリスト銘柄の価格を取得
        for (const symbol of symbols) {
            try {
                let stockData = null;
                
                if (this.lastRankingsData) {
                    const allStocks = [
                        ...(this.lastRankingsData.gainers || []),
                        ...(this.lastRankingsData.losers || []),
                        ...(this.lastRankingsData.volume || []),
                        ...(this.lastRankingsData.market_cap || []),
                    ];
                    stockData = allStocks.find(s => s.symbol === symbol);
                }
                
                if (stockData) {
                    this.updateWatchlistItem(symbol, stockData);
                } else {
                    this.updateWatchlistItemError(symbol);
                }
            } catch (error) {
                console.error(`ウォッチリスト価格取得エラー ${symbol}:`, error);
                this.updateWatchlistItemError(symbol);
            }
        }
    }
    
    updateWatchlistItemError(symbol) {
        const item = document.querySelector(`.watchlist-item[data-symbol="${symbol}"]`);
        if (!item) return;
        
        const priceEl = item.querySelector('.price');
        const changeEl = item.querySelector('.change');
        
        if (priceEl) priceEl.textContent = 'データなし';
        if (changeEl) changeEl.textContent = '---';
    }

    updateWatchlistItem(symbol, data) {
        const item = document.querySelector(`.watchlist-item[data-symbol="${symbol}"]`);
        if (!item) return;

        const priceEl = item.querySelector('.price');
        const changeEl = item.querySelector('.change');

        if (priceEl) {
            priceEl.textContent = this.formatPrice(data.price, data.market === 'JP' ? '¥' : '$');
        }

        if (changeEl) {
            changeEl.textContent = this.formatPercent(data.pct);
            changeEl.className = 'change';
            
            if (data.change > 0) {
                changeEl.classList.add('positive');
            } else if (data.change < 0) {
                changeEl.classList.add('negative');
            } else {
                changeEl.classList.add('neutral');
            }
        }
    }

    // 米国ランキングの全カードに状態メッセージを表示（無限スピナー防止・再読込導線）
    renderUSEmpty(msg) {
        const retry = `<button onclick="window.dashboard && window.dashboard.loadUSRankings()" style="margin-top:8px;padding:4px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:0.85em;">再読込</button>`;
        document.querySelectorAll('[id^="us-"][id$="-ranking"]').forEach(el => {
            el.innerHTML = `<div style="padding:16px;color:#9ca3af;font-size:0.9em;">${msg}<br>${retry}</div>`;
        });
    }

    // JP 期間別ランキングの取得失敗時に、まだ描画されていない枠（スケルトン残存）だけをエラー＋再読込に差し替える。
    // 成功済みセクション（enhanced 由来のデイリー等）は .loading が消えているので潰さない（P2）。
    renderPeriodError(msg) {
        const retry = `<button onclick="window.dashboard && window.dashboard.loadPeriodRankings()" style="margin-top:8px;padding:4px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:0.85em;">再読込</button>`;
        const ids = [
            'gainers-ranking', 'losers-ranking', 'volume-ranking', 'market-cap-ranking',
            'rsi-high-ranking', 'rsi-low-ranking', 'psych-high-ranking', 'psych-low-ranking',
            'margin-ratio-high-ranking', 'margin-ratio-low-ranking',
            'long-increase-ranking', 'long-decrease-ranking',
            'short-increase-ranking', 'short-decrease-ranking',
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.querySelector('.loading')) {
                el.innerHTML = `<div style="padding:16px;color:#9ca3af;font-size:0.9em;">${msg}<br>${retry}</div>`;
            }
        });
    }

    // P3: JP 表示モード切替（カード ⇄ ソート可能テーブル）。非破壊＝カード側DOMは残す。
    switchJpView(mode) {
        this.jpViewMode = mode;
        document.querySelectorAll('[data-jp-view]').forEach(b => b.classList.toggle('active', b.dataset.jpView === mode));
        const wrap = document.getElementById('jp-ranking-table-wrap');
        const catTabs = document.querySelector('.ranking-tabs');   // JP カテゴリタブ（先頭＝JP）
        const jpCats = ['basic', 'price', 'volume', 'financial', 'technical', 'margin', 'ai']
            .map(c => document.getElementById(`${c}-rankings`)).filter(Boolean);
        if (mode === 'table') {
            jpCats.forEach(c => c.classList.add('hidden'));
            if (catTabs) catTabs.style.display = 'none';
            if (wrap) wrap.classList.remove('hidden');
            this.buildJpTable();
        } else {
            if (wrap) wrap.classList.add('hidden');
            if (catTabs) catTabs.style.display = '';
            this.switchRankingCategory(this.currentRankingCategory);  // カード表示を復元
        }
    }

    // P3: 現在の期間の全ランキングリストを symbol で統合し、ソート可能テーブルを描画する。
    buildJpTable() {
        const table = document.getElementById('jp-ranking-table');
        if (!table) return;
        const pdata = this.periodRankingsData && this.periodRankingsData[this.currentPeriod];
        const rankings = pdata && pdata.rankings;
        if (!rankings) {
            table.innerHTML = '<tbody><tr><td style="padding:16px;color:#9ca3af;">データがありません（期間データ未取得）</td></tr></tbody>';
            return;
        }
        const seen = {};
        const rows = [];
        Object.values(rankings).forEach(list => {
            if (Array.isArray(list)) list.forEach(r => {
                if (r && r.symbol && !seen[r.symbol]) { seen[r.symbol] = 1; rows.push(r); }
            });
        });
        const { key, dir } = this.jpTableSort;
        rows.sort((a, b) => {
            let av = a[key], bv = b[key];
            av = (av == null || isNaN(Number(av))) ? -Infinity : Number(av);
            bv = (bv == null || isNaN(Number(bv))) ? -Infinity : Number(bv);
            return dir === 'asc' ? av - bv : bv - av;
        });
        const cols = [
            { key: 'sym', label: '銘柄', cls: 'col-sym' },
            { key: 'current_price', label: '現在値' },
            { key: 'period_change', label: '騰落%' },
            { key: 'period_volume', label: '出来高' },
            { key: 'market_cap', label: '時価総額' },
            { key: 'pe_ratio', label: 'PER' },
            { key: 'pb_ratio', label: 'PBR' },
            { key: 'dividend_yield', label: '配当%' },
            { key: 'rsi', label: 'RSI' },
            { key: 'deviation_25', label: '25日乖離' },
        ];
        const thead = '<thead><tr>' + cols.map(c => {
            const sortCls = (c.key === key) ? (dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
            return `<th class="${[c.cls, sortCls].filter(Boolean).join(' ')}" data-sort="${c.key}">${c.label}</th>`;
        }).join('') + '</tr></thead>';
        const fmtVol = v => { v = Number(v) || 0; if (v >= 1e8) return (v / 1e8).toFixed(1) + '億'; if (v >= 1e4) return Math.round(v / 1e4).toLocaleString('ja-JP') + '万'; return v ? String(v) : '—'; };
        const fmtCap = v => { v = Number(v) || 0; if (v >= 1e12) return (v / 1e12).toFixed(1) + '兆'; if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'; return v ? String(v) : '—'; };
        const num = (v, d, suf = '') => (v != null && !isNaN(Number(v))) ? Number(v).toFixed(d) + suf : '—';
        const body = '<tbody>' + rows.map(r => {
            const chg = Number(r.period_change);
            const chgCls = (chg > 0) ? 'pos' : (chg < 0 ? 'neg' : '');
            const chgTxt = (r.period_change != null && !isNaN(chg)) ? (chg > 0 ? '+' : '') + chg.toFixed(2) + '%' : '—';
            const dev = r.deviation_25;
            const devTxt = (dev != null && !isNaN(Number(dev))) ? (Number(dev) > 0 ? '+' : '') + Number(dev).toFixed(1) + '%' : '—';
            const vol = (r.period_volume != null) ? r.period_volume : r.volume;
            return `<tr onclick="window.location.href='/stocks/detail/?s=${encodeURIComponent(r.symbol)}'" style="cursor:pointer;">`
                + `<td class="col-sym"><span class="sym-code">${r.symbol}</span><br><span class="sym-name">${(r.name || '').slice(0, 18)}</span></td>`
                + `<td>${r.current_price != null ? Number(r.current_price).toLocaleString('en', { maximumFractionDigits: 2 }) : '—'}</td>`
                + `<td class="${chgCls}">${chgTxt}</td>`
                + `<td>${fmtVol(vol)}</td>`
                + `<td>${fmtCap(r.market_cap)}</td>`
                + `<td>${(r.pe_ratio != null && r.pe_ratio > 0) ? num(r.pe_ratio, 1) : '—'}</td>`
                + `<td>${(r.pb_ratio != null && r.pb_ratio > 0) ? num(r.pb_ratio, 2) : '—'}</td>`
                + `<td>${r.dividend_yield ? num(r.dividend_yield, 2) : '—'}</td>`
                + `<td>${num(r.rsi, 0)}</td>`
                + `<td class="${dev > 0 ? 'pos' : (dev < 0 ? 'neg' : '')}">${devTxt}</td>`
                + `</tr>`;
        }).join('') + '</tbody>';
        table.innerHTML = thead + body;
        table.querySelectorAll('thead th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const k = th.dataset.sort;
                if (k === 'sym') return;   // 銘柄列はソート対象外
                if (this.jpTableSort.key === k) {
                    this.jpTableSort.dir = (this.jpTableSort.dir === 'asc') ? 'desc' : 'asc';
                } else {
                    this.jpTableSort.key = k;
                    this.jpTableSort.dir = 'desc';
                }
                this.buildJpTable();
            });
        });
    }

    // P3: 米国株 表示モード切替（カード ⇄ ソート可能テーブル）。非破壊。
    switchUsView(mode) {
        this.usViewMode = mode;
        document.querySelectorAll('[data-us-view]').forEach(b => b.classList.toggle('active', b.dataset.usView === mode));
        const wrap = document.getElementById('us-ranking-table-wrap');
        const catTabs = document.getElementById('us-ranking-tabs');
        const usCats = ['basic', 'price', 'volume', 'financial', 'technical', 'ai']
            .map(c => document.getElementById(`us-${c}-rankings`)).filter(Boolean);
        if (mode === 'table') {
            usCats.forEach(c => c.classList.add('hidden'));
            if (catTabs) catTabs.style.display = 'none';
            if (wrap) wrap.classList.remove('hidden');
            this.buildUsTable();
        } else {
            if (wrap) wrap.classList.add('hidden');
            if (catTabs) catTabs.style.display = '';
            // カード表示を復元（アクティブなUSカテゴリのみ表示）
            const activeCat = (document.querySelector('[data-us-category].active') || {}).dataset;
            const cat = (activeCat && activeCat.usCategory) || 'basic';
            usCats.forEach(c => c.classList.toggle('hidden', c.id !== `us-${cat}-rankings`));
        }
    }

    // P3: 保持済みの米国株生行をソート可能テーブルに描画する。
    buildUsTable() {
        const table = document.getElementById('us-ranking-table');
        if (!table) return;
        const rows = (this.usRawRows || []).slice();
        if (!rows.length) {
            table.innerHTML = '<tbody><tr><td style="padding:16px;color:#9ca3af;">データがありません（米国データ未取得）</td></tr></tbody>';
            return;
        }
        const { key, dir } = this.usTableSort;
        rows.sort((a, b) => {
            let av = a[key], bv = b[key];
            av = (av == null || isNaN(Number(av))) ? -Infinity : Number(av);
            bv = (bv == null || isNaN(Number(bv))) ? -Infinity : Number(bv);
            return dir === 'asc' ? av - bv : bv - av;
        });
        const cols = [
            { key: 'sym', label: '銘柄', cls: 'col-sym' },
            { key: 'current_price', label: '現在値' },
            { key: 'period_change', label: '騰落%' },
            { key: 'period_volume', label: '出来高' },
            { key: 'market_cap', label: '時価総額' },
            { key: 'pe_ratio', label: 'PER' },
            { key: 'pb_ratio', label: 'PBR' },
            { key: 'dividend_yield', label: '配当%' },
            { key: 'rsi', label: 'RSI' },
            { key: 'short_ratio', label: '空売り日' },
        ];
        const thead = '<thead><tr>' + cols.map(c => {
            const sortCls = (c.key === key) ? (dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
            return `<th class="${[c.cls, sortCls].filter(Boolean).join(' ')}" data-sort="${c.key}">${c.label}</th>`;
        }).join('') + '</tr></thead>';
        const fmtVol = v => { v = Number(v) || 0; if (v >= 1e8) return (v / 1e8).toFixed(1) + '億'; if (v >= 1e4) return Math.round(v / 1e4).toLocaleString('ja-JP') + '万'; return v ? String(v) : '—'; };
        const fmtCap = v => { v = Number(v) || 0; if (v >= 1e12) return '$' + (v / 1e12).toFixed(1) + 'T'; if (v >= 1e9) return '$' + (v / 1e9).toFixed(0) + 'B'; if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M'; return v ? String(v) : '—'; };
        const num = (v, d) => (v != null && !isNaN(Number(v))) ? Number(v).toFixed(d) : '—';
        const body = '<tbody>' + rows.map(r => {
            const chg = Number(r.period_change);
            const chgCls = (chg > 0) ? 'pos' : (chg < 0 ? 'neg' : '');
            const chgTxt = (r.period_change != null && !isNaN(chg)) ? (chg > 0 ? '+' : '') + chg.toFixed(2) + '%' : '—';
            const vol = (r.period_volume != null) ? r.period_volume : r.volume;
            return `<tr onclick="window.location.href='/stocks/detail/?s=${encodeURIComponent(r.symbol)}'" style="cursor:pointer;">`
                + `<td class="col-sym"><span class="sym-code">${r.symbol}</span><br><span class="sym-name">${(r.name || '').slice(0, 20)}</span></td>`
                + `<td>${r.current_price != null ? '$' + Number(r.current_price).toLocaleString('en', { maximumFractionDigits: 2 }) : '—'}</td>`
                + `<td class="${chgCls}">${chgTxt}</td>`
                + `<td>${fmtVol(vol)}</td>`
                + `<td>${fmtCap(r.market_cap)}</td>`
                + `<td>${(r.pe_ratio != null && r.pe_ratio > 0) ? num(r.pe_ratio, 1) : '—'}</td>`
                + `<td>${(r.pb_ratio != null && r.pb_ratio > 0) ? num(r.pb_ratio, 2) : '—'}</td>`
                + `<td>${r.dividend_yield ? num(r.dividend_yield, 2) : '—'}</td>`
                + `<td>${num(r.rsi, 0)}</td>`
                + `<td>${r.short_ratio != null ? num(r.short_ratio, 1) : '—'}</td>`
                + `</tr>`;
        }).join('') + '</tbody>';
        table.innerHTML = thead + body;
        table.querySelectorAll('thead th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const k = th.dataset.sort;
                if (k === 'sym') return;
                if (this.usTableSort.key === k) {
                    this.usTableSort.dir = (this.usTableSort.dir === 'asc') ? 'desc' : 'asc';
                } else {
                    this.usTableSort.key = k;
                    this.usTableSort.dir = 'desc';
                }
                this.buildUsTable();
            });
        });
    }

    async loadUSRankings(period = null) {
        // 現在の期間を管理
        if (period) this.currentUsPeriod = period;
        const usPeriod = this.currentUsPeriod || 'daily';

        try {
            let items = [];

            // デイリー・ウィークリー・マンスリー: すべて period_rankings.json を使用（単一ソース）
            if (!this.periodRankingsData) {
                const res = await fetch(this.period_rankings_api);
                if (!res.ok) { this.renderUSEmpty('米国データの取得に失敗しました'); return; }
                this.periodRankingsData = await res.json();
            }
            const usKey = `us_${usPeriod}`;
            const periodSection = this.periodRankingsData[usKey];
            if (!periodSection) { this.renderUSEmpty('米国ランキングは現在データ未生成です'); return; }
            const rankings = periodSection.rankings || {};
            // period_rankings 形式 → items 形式に変換
            const allStocks = [
                ...(rankings.gainers || []),
                ...(rankings.losers || []),
                ...(rankings.volume || []),
                ...(rankings.market_cap || []),
            ];
            // 重複排除
            const seen = new Set();
            const deduped = allStocks.filter(s => {
                if (seen.has(s.symbol)) return false;
                seen.add(s.symbol);
                return true;
            });
            this.usRawRows = deduped;   // P3: テーブル描画用に生行を保持
            items = deduped.map(s => ({
                symbol: s.symbol, name: s.name, price: s.current_price,
                change_percent: s.period_change, volume: s.volume,
                market_cap: s.market_cap ?? 0, pe_ratio: s.pe_ratio,
                dividend_yield: s.dividend_yield, volume_ratio: s.volume_ratio ?? 0,
                deviation_25: s.deviation_25 ?? null,
                deviation_75: s.deviation_75 ?? null,
                year_high: s.year_high ?? 0,
                year_low: s.year_low ?? 0,
                trading_value: s.trading_value ?? 0,
                roe: s.roe ?? null,
            }));

            // ── 各ランキング描画 ──────────────────────────────────────────
            // 基本
            this.renderRanking('us-gainers-ranking',   [...items].filter(s=>s.change_percent>0).sort((a,b)=>b.change_percent-a.change_percent).slice(0,10), 'percentage', '$');
            this.renderRanking('us-losers-ranking',    [...items].filter(s=>s.change_percent<0).sort((a,b)=>a.change_percent-b.change_percent).slice(0,10), 'percentage', '$');
            this.renderRanking('us-volume-ranking',    [...items].sort((a,b)=>(b.volume||0)-(a.volume||0)).slice(0,10), 'volume', '$');
            this.renderRanking('us-marketcap-ranking', [...items].filter(s=>s.market_cap>0).sort((a,b)=>b.market_cap-a.market_cap).slice(0,10), 'market_cap', '$');
            // 値動き関連
            this.renderRanking('us-year-high-ranking',   [...items].filter(s=>s.year_high>0&&s.price>=s.year_high*0.99).sort((a,b)=>b.change_percent-a.change_percent).slice(0,10), 'percentage', '$');
            this.renderRanking('us-year-low-ranking',    [...items].filter(s=>s.year_low>0&&s.price<=s.year_low*1.01).sort((a,b)=>a.change_percent-b.change_percent).slice(0,10), 'percentage', '$');
            this.renderRanking('us-change-high-ranking', [...items].sort((a,b)=>b.change_percent-a.change_percent).slice(0,10), 'percentage', '$');
            this.renderRanking('us-change-low-ranking',  [...items].sort((a,b)=>a.change_percent-b.change_percent).slice(0,10), 'percentage', '$');
            // 出来高関連
            this.renderRanking('us-vol-increase-ranking', [...items].filter(s=>s.volume_ratio>0).sort((a,b)=>b.volume_ratio-a.volume_ratio).slice(0,10), 'volume', '$');
            this.renderRanking('us-trading-value-ranking',[...items].filter(s=>s.trading_value>0).sort((a,b)=>b.trading_value-a.trading_value).slice(0,10), 'volume', '$');
            // 財務指標
            this.renderRanking('us-dividend-ranking', [...items].filter(s=>s.dividend_yield>0).sort((a,b)=>b.dividend_yield-a.dividend_yield).slice(0,10), 'percentage', '$');
            this.renderRanking('us-per-high-ranking', [...items].filter(s=>s.pe_ratio>0).sort((a,b)=>b.pe_ratio-a.pe_ratio).slice(0,10), 'percentage', '$');
            this.renderRanking('us-per-low-ranking',  [...items].filter(s=>s.pe_ratio>0&&s.pe_ratio<200).sort((a,b)=>a.pe_ratio-b.pe_ratio).slice(0,10), 'percentage', '$');
            this.renderRanking('us-roe-ranking',       [...items].filter(s=>s.roe!=null&&s.roe>0).sort((a,b)=>b.roe-a.roe).slice(0,10), 'percentage', '$');
            // テクニカル（period_rankings 生成時に 25/75 日かい離率を付与）
            this.renderRanking('us-dev25-high-ranking', [...items].filter(s=>s.deviation_25>0).sort((a,b)=>b.deviation_25-a.deviation_25).slice(0,10), 'deviation25', '$');
            this.renderRanking('us-dev25-low-ranking',  [...items].filter(s=>s.deviation_25<0).sort((a,b)=>a.deviation_25-b.deviation_25).slice(0,10), 'deviation25', '$');
            this.renderRanking('us-dev75-high-ranking', [...items].filter(s=>s.deviation_75>0).sort((a,b)=>b.deviation_75-a.deviation_75).slice(0,10), 'deviation75', '$');
            this.renderRanking('us-dev75-low-ranking',  [...items].filter(s=>s.deviation_75<0).sort((a,b)=>a.deviation_75-b.deviation_75).slice(0,10), 'deviation75', '$');
            // 空売り比率（W2・period_rankings の short_high/low をそのまま描画）
            const _mapShort = arr => (arr||[]).map(s=>({symbol:s.symbol, name:s.name, price:s.current_price, change_percent:s.period_change, short_ratio:s.short_ratio}));
            this.renderRanking('us-short-high-ranking', _mapShort(rankings.short_high), 'short', '$');
            this.renderRanking('us-short-low-ranking',  _mapShort(rankings.short_low), 'short', '$');

            // P3: テーブル表示中は生行更新後にテーブルを再描画（期間切替に追従）
            if (this.usViewMode === 'table') this.buildUsTable();

            // ── イベントリスナー（初回のみ登録）──────────────────────────
            if (!this._usTabsInit) {
                this._usTabsInit = true;

                // P3: US 表示モード切替（カード / テーブル）
                document.querySelectorAll('[data-us-view]').forEach(btn => {
                    btn.addEventListener('click', () => this.switchUsView(btn.dataset.usView));
                });

                // カテゴリタブ
                document.querySelectorAll('[data-us-category]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        document.querySelectorAll('[data-us-category]').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        const cat = btn.dataset.usCategory;
                        ['basic','price','volume','financial','technical','ai'].forEach(c => {
                            const el = document.getElementById(`us-${c}-rankings`);
                            if (el) el.classList.toggle('hidden', c !== cat);
                        });
                    });
                });

                // 期間タブ
                document.querySelectorAll('[data-us-period]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        document.querySelectorAll('[data-us-period]').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        this.loadUSRankings(btn.dataset.usPeriod);
                    });
                });
            }
        } catch (e) {
            console.error('米国株ランキング取得エラー:', e);
            this.renderUSEmpty('米国株ランキングの取得でエラーが発生しました');
        }
    }

    async loadRankings() {
        try {
            const response = await fetch(this.rankings_api);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            this.lastRankingsData = data; // データを保存
            this.updateRankings(data);
            
        } catch (error) {
            console.error('ランキングデータ取得エラー:', error);
            // ランキングはサブ機能なので、エラーでも全体は停止しない
            this.showRankingError();
        }
    }

    updateRankings(data) {
        // enhanced_rankings.json は basic.gainers/losers/volume_high/market_cap_high
        const basic = data.basic || data;
        // 値上がりランキング
        this.renderRanking('gainers-ranking', basic.gainers, 'percentage');

        // 値下がりランキング
        this.renderRanking('losers-ranking', basic.losers, 'percentage');

        // 出来高ランキング
        this.renderRanking('volume-ranking', basic.volume_high || basic.volume, 'volume');

        // 時価総額ランキング
        this.renderRanking('market-cap-ranking', basic.market_cap_high || basic.market_cap, 'market_cap');
    }

    renderRanking(elementId, stocks, type, currency = '¥') {
        const container = document.getElementById(elementId);
        if (!container || !stocks || stocks.length === 0) {
            if (container) {
                container.innerHTML = '<div class="loading">データなし</div>';
            }
            return;
        }

        const html = stocks.map((stock, index) => {
            const rank = index + 1;
            let valueText = '';
            let changeText = '';
            let changeClass = 'neutral';

            // 表示値の決定
            switch (type) {
                case 'percentage':
                    valueText = this.formatPrice(stock.price, currency);
                    changeText = this.formatPercent(stock.change_percent);
                    break;
                case 'deviation25':
                    valueText = this.formatPrice(stock.price, currency);
                    changeText = this.formatPercent(stock.deviation_25);
                    break;
                case 'deviation75':
                    valueText = this.formatPrice(stock.price, currency);
                    changeText = this.formatPercent(stock.deviation_75);
                    break;
                case 'volume':
                    valueText = this.formatVolume(stock.volume);
                    changeText = this.formatPercent(stock.change_percent);
                    break;
                case 'market_cap':
                    valueText = this.formatMarketCap(stock.market_cap, currency);
                    changeText = this.formatPercent(stock.change_percent);
                    break;
                case 'short':
                    valueText = (stock.short_ratio != null) ? `空売り${stock.short_ratio.toFixed(1)}日` : '—';
                    changeText = this.formatPercent(stock.change_percent);
                    break;
            }

            // 変化率の色分け
            const pctForColor = type === 'deviation25' ? stock.deviation_25
                : type === 'deviation75' ? stock.deviation_75
                : stock.change_percent;
            if (pctForColor > 0) {
                changeClass = 'positive';
            } else if (pctForColor < 0) {
                changeClass = 'negative';
            }

            return `
                <div class="ranking-item" onclick="if(typeof gtag==='function')gtag('event','ranking_item_click',{symbol:'${stock.symbol}'});window.location.href='/stocks/detail/?s=${encodeURIComponent(stock.symbol)}'" style="cursor:pointer;">
                    <div class="ranking-item-left">
                        <span class="ranking-symbol">${rank}. ${stock.symbol}</span>
                        <span class="ranking-name">${stock.name}</span>
                    </div>
                    <div class="ranking-item-right">
                        <div class="ranking-values">
                            <span class="ranking-value">${valueText}</span>
                            <span class="ranking-change ${changeClass}">${changeText}</span>
                        </div>
                        <button class="btn-star" data-symbol="${stock.symbol}" onclick="event.stopPropagation(); toggleWatchlist('${stock.symbol}')" title="ウォッチリストに追加">⭐</button>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }
    
    setupRankingTabs() {
        // ランキングタブのイベントリスナー設定
        const tabButtons = document.querySelectorAll('.tab-button');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category;
                if (category) this.switchRankingCategory(category);
            });
        });

        // P3: JP 表示モード切替（カード / テーブル）
        document.querySelectorAll('[data-jp-view]').forEach(btn => {
            btn.addEventListener('click', () => this.switchJpView(btn.dataset.jpView));
        });
    }
    
    switchRankingCategory(category) {
        this.trackEvent('ranking_tab_switch', { category });
        // ランキングカテゴリを切り替え
        // アクティブなタブを更新
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-category="${category}"]`).classList.add('active');
        
        // ランキングカテゴリを切り替え
        document.querySelectorAll('.ranking-category').forEach(cat => {
            cat.classList.add('hidden');
        });
        document.getElementById(`${category}-rankings`).classList.remove('hidden');
        
        this.currentRankingCategory = category;
        
        // カテゴリ別データ更新
        if (category === 'basic') {
            this.updatePeriodRankings();
        } else if (category === 'price') {
            this.updateEnhancedRankings();
        }
    }
    
    async loadExtendedRankings() {
        // 拡張ランキングデータを読み込み
        try {
            const response = await fetch(this.extended_rankings_api);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            this.updateExtendedRankings(data);
            
        } catch (error) {
            console.error('拡張ランキングデータ取得エラー:', error);
            this.showExtendedRankingError();
        }
    }
    
    updateExtendedRankings(data) {
        // 拡張ランキングを更新
        // 値動き関連
        this.renderExtendedRanking('stop-high-ranking', data.stop_high, 'stop_status');
        this.renderExtendedRanking('stop-low-ranking', data.stop_low, 'stop_status');
        this.renderExtendedRanking('year-high-ranking', data.year_high_update, 'year_status');
        this.renderExtendedRanking('year-low-ranking', data.year_low_update, 'year_status');
        
        // 出来高関連
        this.renderExtendedRanking('volume-increase-ranking', data.volume_increase, 'volume_ratio');
        this.renderExtendedRanking('volume-decrease-ranking', data.volume_decrease, 'volume_ratio');
        this.renderExtendedRanking('trading-value-high-ranking', data.trading_value_high, 'trading_value');
        this.renderExtendedRanking('trading-value-low-ranking', data.trading_value_low, 'trading_value');
        
        // 財務指標
        this.renderExtendedRanking('dividend-high-ranking', data.dividend_yield_high, 'dividend');
        this.renderExtendedRanking('pe-high-ranking', data.forward_pe_high, 'pe');
        this.renderExtendedRanking('pe-low-ranking', data.forward_pe_low, 'pe');
        this.renderExtendedRanking('pbr-high-ranking', data.pbr_high, 'pbr');
        this.renderExtendedRanking('pbr-low-ranking', data.pbr_low, 'pbr');
        this.renderExtendedRanking('roa-high-ranking', data.roa_high, 'roa');
        this.renderExtendedRanking('roe-high-ranking', data.roe_high, 'roe');
        this.renderExtendedRanking('employees-high-ranking', data.employees_high, 'employees');
        
        // テクニカル
        this.renderExtendedRanking('deviation-25-high-ranking', data.deviation_25_high, 'deviation');
        this.renderExtendedRanking('deviation-25-low-ranking', data.deviation_25_low, 'deviation');
        this.renderExtendedRanking('deviation-75-high-ranking', data.deviation_75_high, 'deviation');
        this.renderExtendedRanking('deviation-75-low-ranking', data.deviation_75_low, 'deviation');
        this.renderExtendedRanking('golden-cross-ranking', data.golden_cross, 'cross_signal');
        this.renderExtendedRanking('dead-cross-ranking', data.dead_cross, 'cross_signal');

        // 追加指標（2026-06-12）: PSR・純利益率・52週位置
        this.renderExtendedRanking('psr-low-ranking', data.psr_low, 'psr');
        this.renderExtendedRanking('psr-high-ranking', data.psr_high, 'psr');
        this.renderExtendedRanking('net-margin-high-ranking', data.net_margin_high, 'net_margin');
        this.renderExtendedRanking('year-position-high-ranking', data.year_position_high, 'year_position');
        this.renderExtendedRanking('year-position-low-ranking', data.year_position_low, 'year_position');
    }
    
    renderExtendedRanking(elementId, stocks, type) {
        // 拡張ランキングをレンダリング
        const container = document.getElementById(elementId);
        if (!container) return;
        
        if (!stocks || stocks.length === 0) {
            container.innerHTML = '<div class="loading">データなし</div>';
            return;
        }
        
        const html = stocks.map((stock, index) => {
            const rank = index + 1;
            let valueText = '';
            let subText = '';
            let changeClass = 'neutral';
            
            // 表示値の決定
            switch (type) {
                case 'stop_status':
                    valueText = this.formatPrice(stock.price, '￥');
                    subText = 'ストップ適用';
                    break;
                case 'year_status':
                    valueText = this.formatPrice(stock.price, '￥');
                    subText = '更新';
                    break;
                case 'volume_ratio':
                    valueText = this.formatVolume(stock.volume);
                    subText = stock.volume_ratio ? `${stock.volume_ratio.toFixed(1)}%` : '--';
                    break;
                case 'trading_value':
                    valueText = this.formatTradingValue(stock.trading_value);
                    subText = this.formatPercent(stock.change_percent);
                    break;
                case 'dividend':
                    valueText = stock.dividend_yield ? `${stock.dividend_yield.toFixed(2)}%` : '--';
                    subText = this.formatPrice(stock.price, '￥');
                    break;
                case 'pe':
                    valueText = stock.forward_pe ? `${stock.forward_pe.toFixed(1)}倍` : '--';
                    subText = this.formatPrice(stock.price, '￥');
                    break;
                case 'pbr':
                    valueText = stock.price_to_book ? `${stock.price_to_book.toFixed(2)}倍` : '--';
                    subText = this.formatPrice(stock.price, '￥');
                    break;
                case 'roa':
                    valueText = stock.return_on_assets ? `${stock.return_on_assets.toFixed(2)}%` : '--';
                    subText = this.formatPrice(stock.price, '￥');
                    break;
                case 'roe':
                    valueText = stock.return_on_equity ? `${stock.return_on_equity.toFixed(2)}%` : '--';
                    subText = this.formatPrice(stock.price, '￥');
                    break;
                case 'employees':
                    valueText = stock.full_time_employees ? `${stock.full_time_employees.toLocaleString()}人` : '--';
                    subText = this.formatPrice(stock.price, '￥');
                    break;
                case 'deviation':
                    const deviation = stock.deviation_25 || stock.deviation_75 || 0;
                    valueText = `${deviation.toFixed(2)}%`;
                    subText = this.formatPrice(stock.price, '￥');
                    break;
                case 'cross_signal':
                    valueText = this.formatPrice(stock.price, '￥');
                    subText = 'シグナル発生';
                    break;
                case 'psr':
                    valueText = stock.psr ? `${stock.psr.toFixed(2)}倍` : '--';
                    subText = this.formatPrice(stock.price, '￥');
                    break;
                case 'net_margin':
                    valueText = (stock.net_margin || stock.net_margin === 0) ? `${stock.net_margin.toFixed(1)}%` : '--';
                    subText = this.formatPrice(stock.price, '￥');
                    break;
                case 'year_position':
                    valueText = (stock.year_position || stock.year_position === 0) ? `${stock.year_position.toFixed(0)}%` : '--';
                    subText = this.formatPrice(stock.price, '￥');
                    break;
                default:
                    valueText = this.formatPrice(stock.price, '￥');
                    subText = this.formatPercent(stock.change_percent);
            }
            
            // 変化率の色分け
            if (stock.change_percent > 0) {
                changeClass = 'positive';
            } else if (stock.change_percent < 0) {
                changeClass = 'negative';
            }
            
            return `
                <div class="ranking-item" onclick="if(typeof gtag==='function')gtag('event','ranking_item_click',{symbol:'${stock.symbol}'});window.location.href='/stocks/detail/?s=${encodeURIComponent(stock.symbol)}'" style="cursor:pointer;">
                    <div class="ranking-item-left">
                        <span class="ranking-symbol">${rank}. ${stock.symbol}</span>
                        <span class="ranking-name">${stock.name}</span>
                    </div>
                    <div class="ranking-item-right">
                        <span class="ranking-value">${valueText}</span>
                        <span class="ranking-change ${changeClass}">${subText}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = html;
    }
    
    formatTradingValue(value) {
        // 売買代金のフォーマット
        if (value >= 1000000000000) {
            return (value / 1000000000000).toFixed(1) + '兆円';
        } else if (value >= 100000000) {
            return (value / 100000000).toFixed(1) + '億円';
        } else if (value >= 10000) {
            return (value / 10000).toFixed(1) + '万円';
        }
        return value.toLocaleString() + '円';
    }
    
    showExtendedRankingError() {
        // 拡張ランキングエラー表示
        const extendedRankingContainers = [
            'stop-high-ranking', 'stop-low-ranking', 'year-high-ranking', 'year-low-ranking',
            'volume-increase-ranking', 'volume-decrease-ranking', 'trading-value-high-ranking', 'trading-value-low-ranking',
            'dividend-high-ranking', 'pe-high-ranking', 'pe-low-ranking', 'pbr-high-ranking', 'pbr-low-ranking',
            'roa-high-ranking', 'roe-high-ranking', 'employees-high-ranking',
            'deviation-25-high-ranking', 'deviation-25-low-ranking', 'deviation-75-high-ranking', 'deviation-75-low-ranking',
            'golden-cross-ranking', 'dead-cross-ranking',
            'psr-low-ranking', 'psr-high-ranking', 'net-margin-high-ranking',
            'year-position-high-ranking', 'year-position-low-ranking'
        ];
        
        extendedRankingContainers.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.innerHTML = '<div class="loading">データ取得エラー</div>';
            }
        });
    }

    formatVolume(volume) {
        const raw = (volume || 0).toLocaleString('en-US');
        if (volume >= 1e8) {
            return `${(volume / 1e8).toFixed(1)}億株 <span style="font-size:0.82em;color:#9ca3af;">(${raw})</span>`;
        } else if (volume >= 1e4) {
            return `${Math.round(volume / 1e4).toLocaleString('ja-JP')}万株 <span style="font-size:0.82em;color:#9ca3af;">(${raw})</span>`;
        }
        return raw + '株';
    }

    formatMarketCap(marketCap, currency = '¥') {
        const gray = (s) => ` <span style="font-size:0.82em;color:#9ca3af;">(${s})</span>`;
        if (currency === '$') {
            // USD建て: 兆ドル / 十億ドル表記 + 生数値
            const raw = '$' + (marketCap || 0).toLocaleString('en-US');
            if (marketCap >= 1000000000000) {
                return `$${(marketCap / 1000000000000).toFixed(1)}兆${gray(raw)}`;
            } else if (marketCap >= 1000000000) {
                return `$${(marketCap / 1000000000).toFixed(1)}B${gray(raw)}`;
            }
            return raw;
        }
        // JPY建て: 兆円 / 億円表記 + 生数値
        const rawJ = (marketCap || 0).toLocaleString('en-US') + '円';
        if (marketCap >= 1000000000000) {
            return `${(marketCap / 1000000000000).toFixed(1)}兆円${gray(rawJ)}`;
        } else if (marketCap >= 100000000) {
            return `${(marketCap / 100000000).toFixed(1)}億円${gray(rawJ)}`;
        } else if (marketCap >= 10000) {
            return `${(marketCap / 10000).toFixed(1)}万円${gray(rawJ)}`;
        }
        return rawJ;
    }

    showRankingError() {
        const rankingContainers = [
            'gainers-ranking', 'losers-ranking', 
            'volume-ranking', 'market-cap-ranking'
        ];
        
        rankingContainers.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.innerHTML = '<div class="loading">データ取得エラー</div>';
            }
        });
        
        // 拡張ランキングもエラー表示
        this.showExtendedRankingError();
    }

    showError() {
        const indices = document.querySelectorAll('.index-price');
        indices.forEach(el => {
            el.textContent = 'エラー';
        });
        
        const lastUpdated = document.getElementById('last-updated');
        if (lastUpdated) {
            lastUpdated.textContent = 'データ取得エラー';
        }
    }
}

// DOMContentLoaded後に初期化
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new Dashboard();
});

// 追加CSS（ウォッチリスト用）
const watchlistCSS = `
<style>
.watchlist-items {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.watchlist-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--card-separator-color);
    cursor: pointer;
    transition: background-color 0.2s ease;
}

.watchlist-item:last-child {
    border-bottom: none;
}

.watchlist-item:hover {
    background-color: var(--accent-color-light);
    border-radius: 4px;
    padding-left: 8px;
    padding-right: 8px;
}

.watchlist-item .symbol {
    font-weight: 500;
    color: var(--card-text-color-main);
}

.watchlist-item .price {
    font-weight: bold;
}

.watchlist-item .change {
    font-size: 0.9rem;
    font-weight: 500;
}

.watchlist-item .change.positive { color: var(--success-color); }
.watchlist-item .change.negative { color: var(--error-color); }
.watchlist-item .change.neutral { color: var(--card-text-color-tertiary); }
</style>
`;

document.head.insertAdjacentHTML('beforeend', watchlistCSS);

// 期間別ランキング機能の拡張
Dashboard.prototype.loadPeriodRankings = async function() {
    try {
        const response = await fetch(this.period_rankings_api);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        this.periodRankingsData = data;
        this.updatePeriodRankings();

        // RSI・心理線は期間非依存（daily セクションを単一ソースとして描画）
        const dailyRk = (data.daily && data.daily.rankings) || {};
        this.updatePeriodRankingList('rsi-high-ranking', dailyRk.rsi_high || []);
        this.updatePeriodRankingList('rsi-low-ranking', dailyRk.rsi_low || []);
        this.updatePeriodRankingList('psych-high-ranking', dailyRk.psych_high || []);
        this.updatePeriodRankingList('psych-low-ranking', dailyRk.psych_low || []);

        // 信用残高 需給ランキング（W4・週次・margin ブロックを単一ソースとして描画）
        const marginRk = (data.margin && data.margin.rankings) || {};
        this.updateMarginRankingList('margin-ratio-high-ranking', marginRk.margin_ratio_high || []);
        this.updateMarginRankingList('margin-ratio-low-ranking', marginRk.margin_ratio_low || []);
        this.updateMarginRankingList('long-increase-ranking', marginRk.long_increase || []);
        this.updateMarginRankingList('long-decrease-ranking', marginRk.long_decrease || []);
        this.updateMarginRankingList('short-increase-ranking', marginRk.short_increase || []);
        this.updateMarginRankingList('short-decrease-ranking', marginRk.short_decrease || []);

    } catch (error) {
        console.error('期間別ランキング取得エラー:', error);
        this.renderPeriodError('ランキングデータの取得に失敗しました');
    }
};

// 信用残高 需給ランキング描画（信用倍率・買残/売残 前週比）
Dashboard.prototype.updateMarginRankingList = function(elementId, data) {
    const element = document.getElementById(elementId);
    if (!element || !data || data.length === 0) {
        if (element) {
            element.innerHTML = '<div class="no-data">データ蓄積中（週次更新）</div>';
        }
        return;
    }
    const fmtPct = (v) => (v == null) ? '--' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
    const fmtNum = (v) => (v == null) ? '--' : Number(v).toLocaleString();
    const html = data.map((item, index) => {
        // 表示値: 倍率系=信用倍率 / 買残系=買残前週比 / 売残系=売残前週比
        let valueDisplay, subVal, subClass;
        if (elementId.includes('margin-ratio')) {
            valueDisplay = `信用倍率 ${item.margin_ratio != null ? item.margin_ratio.toFixed(2) : '--'}倍`;
            subVal = `買残${fmtPct(item.long_wow_pct)} / 売残${fmtPct(item.short_wow_pct)}`;
            subClass = 'neutral';
        } else if (elementId.includes('long-')) {
            valueDisplay = `買残 ${fmtNum(item.long_balance)}`;
            subVal = `前週比 ${fmtPct(item.long_wow_pct)}`;
            subClass = item.long_wow_pct > 0 ? 'positive' : item.long_wow_pct < 0 ? 'negative' : 'neutral';
        } else {
            valueDisplay = `売残 ${fmtNum(item.short_balance)}`;
            subVal = `前週比 ${fmtPct(item.short_wow_pct)}`;
            subClass = item.short_wow_pct > 0 ? 'positive' : item.short_wow_pct < 0 ? 'negative' : 'neutral';
        }
        const tkr = item.ticker || '';
        return `
            <div class="ranking-item" onclick="window.location.href='/stocks/detail/?s=${encodeURIComponent(tkr)}'">
                <div class="ranking-item-left">
                    <div class="ranking-symbol">${index + 1}. ${tkr}</div>
                    <div class="ranking-name">${item.name || tkr}</div>
                </div>
                <div class="ranking-item-right">
                    <div class="ranking-values">
                        <div class="ranking-value">${valueDisplay}</div>
                        <div class="ranking-change ${subClass}">${subVal}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    element.innerHTML = html;
};

Dashboard.prototype.updatePeriodRankings = function() {
    // デイリーは enhanced_rankings.json の basic データを使用
    if (this.currentPeriod === 'daily') {
        if (this.lastRankingsData && this.currentRankingCategory === 'basic') {
            const basic = this.lastRankingsData.basic || this.lastRankingsData;
            this.renderRanking('gainers-ranking', basic.gainers, 'percentage');
            this.renderRanking('losers-ranking', basic.losers, 'percentage');
            this.renderRanking('volume-ranking', basic.volume_high || basic.volume, 'volume');
            this.renderRanking('market-cap-ranking', basic.market_cap_high || basic.market_cap, 'market_cap');
        }
        return;
    }

    if (!this.periodRankingsData || !this.periodRankingsData[this.currentPeriod]) {
        return;
    }

    const periodData = this.periodRankingsData[this.currentPeriod];
    const rankings = periodData.rankings;

    // 基本ランキングを更新
    if (this.currentRankingCategory === 'basic') {
        this.updatePeriodRankingList('gainers-ranking', rankings.gainers || []);
        this.updatePeriodRankingList('losers-ranking', rankings.losers || []);
        this.updatePeriodRankingList('volume-ranking', rankings.volume || []);
        this.updatePeriodRankingList('market-cap-ranking', rankings.market_cap || []);
    }
};

Dashboard.prototype.updatePeriodRankingList = function(elementId, data) {
    const element = document.getElementById(elementId);
    if (!element || !data || data.length === 0) {
        if (element) {
            element.innerHTML = '<div class="no-data">データがありません</div>';
        }
        return;
    }

    const html = data.map((item, index) => {
        const changeClass = item.period_change > 0 ? 'positive' : 
                           item.period_change < 0 ? 'negative' : 'neutral';
        
        const formattedPrice = this.formatPrice(item.current_price);
        const formattedChange = this.formatPercent(item.period_change);
        // 出来高は期間内合計（period_volume）を優先表示。期間タブで数字が変わる（P1）。未生成JSONは当日volumeにfallback
        const formattedVolume = this.formatVolume(item.period_volume ?? item.volume);
        const formattedMarketCap = this.formatMarketCap(item.market_cap);
        
        let valueDisplay = '';
        if (elementId.includes('rsi')) {
            valueDisplay = (item.rsi != null) ? `RSI ${item.rsi.toFixed(1)}` : '--';
        } else if (elementId.includes('psych')) {
            valueDisplay = (item.psychological_line != null) ? `${item.psychological_line.toFixed(0)}%` : '--';
        } else if (elementId.includes('volume')) {
            valueDisplay = formattedVolume;
        } else if (elementId.includes('market-cap')) {
            valueDisplay = formattedMarketCap;
        } else {
            valueDisplay = formattedPrice;
        }
        
        return `
            <div class="ranking-item" onclick="if(typeof gtag==='function')gtag('event','ranking_item_click',{symbol:'${item.symbol}'});window.location.href='/stocks/detail/?s=${encodeURIComponent(item.symbol)}'">
                <div class="ranking-item-left">
                    <div class="ranking-symbol">${index + 1}. ${item.symbol}</div>
                    <div class="ranking-name">${item.name}</div>
                </div>
                <div class="ranking-item-right">
                    <div class="ranking-values">
                        <div class="ranking-value">${valueDisplay}</div>
                        <div class="ranking-change ${changeClass}">${formattedChange}</div>
                    </div>
                    <span class="watchlist-star" onclick="event.stopPropagation(); toggleWatchlist('${item.symbol}')">⭐</span>
                </div>
            </div>
        `;
    }).join('');

    element.innerHTML = html;
};

Dashboard.prototype.switchPeriod = function(period) {
    console.log('switchPeriod called:', period);
    this.trackEvent('period_tab_switch', { period });
    this.currentPeriod = period;

    // アクティブな期間タブを更新
    document.querySelectorAll('.period-button').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`[data-period="${period}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // P3: テーブル表示中は期間切替でテーブルを再描画（カードは非表示なので更新不要）
    if (this.jpViewMode === 'table') {
        this.buildJpTable();
        return;
    }

    // デイリー: enhanced_rankings の basic データを使用
    if (period === 'daily' && this.lastRankingsData) {
        const basic = this.lastRankingsData.basic || this.lastRankingsData;
        this.renderRanking('gainers-ranking', basic.gainers, 'percentage');
        this.renderRanking('losers-ranking', basic.losers, 'percentage');
        this.renderRanking('volume-ranking', basic.volume_high || basic.volume, 'volume');
        this.renderRanking('market-cap-ranking', basic.market_cap_high || basic.market_cap, 'market_cap');
        return;
    }

    // ウィークリー・マンスリー: period_rankings データを使用
    if (this.periodRankingsData && this.periodRankingsData[period]) {
        const rankings = this.periodRankingsData[period].rankings;
        this.updatePeriodRankingList('gainers-ranking', rankings.gainers || []);
        this.updatePeriodRankingList('losers-ranking', rankings.losers || []);
        this.updatePeriodRankingList('volume-ranking', rankings.volume || []);
        this.updatePeriodRankingList('market-cap-ranking', rankings.market_cap || []);
    }
};

Dashboard.prototype.setupPeriodTabs = function() {
    const self = this;
    document.querySelectorAll('.period-button').forEach(button => {
        button.addEventListener('click', function() {
            const period = this.dataset.period;
            console.log('period button clicked:', period);
            if (period) self.switchPeriod(period);
        });
    });
};

Dashboard.prototype.loadEnhancedRankings = async function() {
    try {
        const response = await fetch(this.enhanced_rankings_api);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        this.enhancedRankingsData = data;
        this.updateEnhancedRankings();
        
    } catch (error) {
        console.error('拡張ランキング（強化版）取得エラー:', error);
    }
};

Dashboard.prototype.updateEnhancedRankings = function() {
    if (!this.enhancedRankingsData) {
        return;
    }
    
    // 値動き関連ランキングを更新
    if (this.currentRankingCategory === 'price') {
        const priceData = this.enhancedRankingsData.price_movement;
        this.updateEnhancedRankingList('stop-high-ranking', priceData.stop_high || []);
        this.updateEnhancedRankingList('stop-low-ranking', priceData.stop_low || []);
        this.updateEnhancedRankingList('year-high-ranking', priceData.year_high_update || []);
        this.updateEnhancedRankingList('year-low-ranking', priceData.year_low_update || []);
    }
};

Dashboard.prototype.updateEnhancedRankingList = function(elementId, data) {
    const element = document.getElementById(elementId);
    if (!element) {
        return;
    }
    
    if (!data || data.length === 0) {
        element.innerHTML = '<div class="no-data">📊 現在該当する銘柄がありません</div>';
        return;
    }

    const html = data.map((item, index) => {
        const changeClass = item.change_percent > 0 ? 'positive' : 
                           item.change_percent < 0 ? 'negative' : 'neutral';
        
        const formattedPrice = this.formatPrice(item.price);
        const formattedChange = this.formatPercent(item.change_percent);
        
        let statusText = '';
        if (elementId.includes('stop-high')) {
            statusText = 'ストップ高';
        } else if (elementId.includes('stop-low')) {
            statusText = 'ストップ安';
        } else if (elementId.includes('year-high')) {
            statusText = '年高値更新';
        } else if (elementId.includes('year-low')) {
            statusText = '年安値更新';
        }
        
        return `
            <div class="ranking-item" onclick="if(typeof gtag==='function')gtag('event','ranking_item_click',{symbol:'${item.symbol}'});window.location.href='/stocks/detail/?s=${encodeURIComponent(item.symbol)}'">
                <div class="ranking-item-left">
                    <div class="ranking-symbol">${index + 1}. ${item.symbol}</div>
                    <div class="ranking-name">${item.name}</div>
                </div>
                <div class="ranking-item-right">
                    <div class="ranking-values">
                        <div class="ranking-value">${formattedPrice}</div>
                        <div class="ranking-change ${changeClass}">${statusText}</div>
                    </div>
                    <span class="watchlist-star" onclick="event.stopPropagation(); toggleWatchlist('${item.symbol}')">⭐</span>
                </div>
            </div>
        `;
    }).join('');

    element.innerHTML = html;
};
Dashboard.prototype.loadAiRankings = async function() {
    try {
        const res = await fetch(this.ai_rankings_api);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        this.renderAiRanking('jp-ai-bullish-high-ranking', data.jp?.bullish_high || [], '¥');
        this.renderAiRanking('jp-ai-bearish-high-ranking', data.jp?.bearish_high || [], '¥');
        this.renderAiRanking('jp-ai-notable-ranking',      data.jp?.notable      || [], '¥');
        this.renderAiRanking('us-ai-bullish-high-ranking', data.us?.bullish_high || [], '$');
        this.renderAiRanking('us-ai-bearish-high-ranking', data.us?.bearish_high || [], '$');
        this.renderAiRanking('us-ai-notable-ranking',      data.us?.notable      || [], '$');
    } catch (e) {
        console.error('AI予測ランキング取得エラー:', e);
    }
};

Dashboard.prototype.renderAiRanking = function(elementId, items, currency) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (!items || items.length === 0) {
        el.innerHTML = '<div class="no-data">📊 データなし</div>';
        return;
    }
    const html = items.map((item, i) => {
        const pct = item.predicted_change;
        const changeClass = pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'neutral';
        const sign = pct > 0 ? '+' : '';
        const confPct = Math.round((item.confidence || 0) * 100);
        const barWidth = Math.min(100, confPct);
        const priceText = currency === '$'
            ? `$${(item.price || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
            : `¥${(item.price || 0).toLocaleString('ja-JP')}`;
        return `
            <div class="ranking-item" onclick="if(typeof gtag==='function')gtag('event','ranking_item_click',{symbol:'${item.symbol}'});window.location.href='/stocks/detail/?s=${encodeURIComponent(item.symbol)}'" style="cursor:pointer;">
                <div class="ranking-item-left">
                    <span class="ranking-symbol">${i + 1}. ${item.symbol}</span>
                    <span class="ranking-name">${item.name}</span>
                    <span class="confidence-bar" style="width:${barWidth}%;" title="信頼度 ${confPct}%"></span>
                </div>
                <div class="ranking-item-right">
                    <div class="ranking-values">
                        <span class="ranking-value">${priceText}</span>
                        <span class="ranking-change ${changeClass}">${sign}${pct.toFixed(2)}% (信頼${confPct}%)</span>
                    </div>
                </div>
            </div>`;
    }).join('');
    el.innerHTML = html;
};
