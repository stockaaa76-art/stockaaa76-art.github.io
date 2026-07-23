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
        // #215 ランキング＝スクリーナー型ページ（1画面1ランキング）。専用DOMがあれば旧ダッシュボード初期化は行わない。
        if (document.getElementById('rk-screener')) {
            try { await this.initScreener(); }
            catch (e) { console.error('スクリーナー初期化エラー:', e); }
            return;
        }
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
            await this.loadWorldWatch();
            await this.loadMLRanking();
            await this.loadMLRanking('/api/ml_monthly_ranking_us.json', 'ml-ranking-us-list');
            await this.loadCoverageBadge();
            this.setupEventListeners();
            this.setupCardCollapse();
            this.setupRankingDrilldown(); // #194 ①ショートカード概観の「全て見る」ドリルダウン
            this.setupSectionCollapse();  // #193 二次セクションのアコーディオン化
            this.setupSectionNav();       // #193 横スティッキー目次ピル

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
                this.loadWorldWatch();
                this.loadMLRanking();
                this.loadMLRanking('/api/ml_monthly_ranking_us.json', 'ml-ranking-us-list');
            }, 5 * 60 * 1000);
            
        } catch (error) {
            console.error('Dashboard初期化エラー:', error);
            this.showError();
        }
    }

    // 分析対象銘柄数バッジを universe.json から動的取得（ハードコード陳腐化の防止）
    async loadCoverageBadge() {
        try {
            const res = await fetch('/api/universe.json');
            if (!res.ok) return;
            const data = await res.json();
            const count = data?.metadata?.total_stocks;
            if (!count) return;
            const badge = document.getElementById('coverage-badge');
            if (badge) badge.textContent = `${count}銘柄対応`;
            const countEl = document.getElementById('coverage-count');
            if (countEl) countEl.textContent = `${count}銘柄`;
        } catch (e) {
            // 取得失敗時はHTMLのフォールバック値を維持
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
        // HTML側は「最終更新: <span id="last-updated-time">」構造のため日時のみ入れる
        const el = document.getElementById('last-updated-time');
        if (el) {
            const date = new Date(timestamp);
            const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000)); // JST変換
            el.textContent = `${this.formatDateTime(jstDate)} JST`;
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

    // ランキングカード内インライン用の小型スパークライン（P4 視覚化）。
    // canvas を直接受け取り、直近終値系列（data-spark）をトレンド線として描く。
    drawMiniSpark(canvas, values) {
        if (!canvas || !Array.isArray(values) || values.length < 2) return;
        const dpr = window.devicePixelRatio || 1;
        const w = 56, h = 22;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const pad = 2;
        const up = values[values.length - 1] >= values[0];
        ctx.strokeStyle = up ? '#10b981' : '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        values.forEach((v, i) => {
            const x = (i / (values.length - 1)) * (w - pad * 2) + pad;
            const y = h - pad - ((v - min) / range) * (h - pad * 2);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
        // エンドポイント
        const lx = w - pad;
        const ly = h - pad - ((values[values.length - 1] - min) / range) * (h - pad * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(lx, ly, 1.6, 0, 2 * Math.PI);
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
    async loadThemeCandidates(limit = 15) {
        const el = document.getElementById('theme-candidates-list');
        if (!el) return;
        try {
            const res = await fetch('/api/theme_candidates.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const cands = (data.candidates || []).slice(0, limit);
            if (cands.length === 0) {
                el.innerHTML = '<div class="no-data">本日はユニバース外の急騰なし</div>';
                return;
            }
            const fmtPct = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);
            const pctCls = (v) => (v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral');
            el.innerHTML = cands.map((c, i) => {
                const chg = c.change_1d || 0;
                const cls = pctCls(chg);
                const reasons = (c.detected_reasons || []).join(' / ');
                // 前日比だけでなく 5日(≒ウィークリー)・月次(≒20日)の騰落も併記（データがある場合）
                const periodParts = [];
                if (c.change_5d != null) periodParts.push(`5日 <span class="${pctCls(c.change_5d)}">${fmtPct(c.change_5d)}</span>`);
                if (c.change_20d != null) periodParts.push(`月次 <span class="${pctCls(c.change_20d)}">${fmtPct(c.change_20d)}</span>`);
                const periodLine = periodParts.length
                    ? `<div class="ranking-name theme-periods" style="font-size:.8em;opacity:.85">${periodParts.join('　')}</div>`
                    : '';
                return `
                    <div class="ranking-item" onclick="window.location.href='/stocks/detail/?s=${encodeURIComponent(c.ticker)}'">
                        <div class="ranking-item-left">
                            <div class="ranking-symbol">${i + 1}. 🆕 ${c.ticker}</div>
                            <div class="ranking-name">${c.name}　<span style="opacity:.7">[${c.sector17 || ''}]</span></div>
                            ${periodLine}
                            <div class="ranking-name" style="font-size:.8em;opacity:.75">${reasons}</div>
                        </div>
                        <div class="ranking-item-right">
                            <div class="ranking-values">
                                <div class="ranking-value">¥${(c.current || 0).toLocaleString()}</div>
                                <div class="ranking-change ${cls}">前日 ${fmtPct(chg)}</div>
                            </div>
                        </div>
                    </div>`;
            }).join('');
        } catch (e) {
            el.innerHTML = '<div class="no-data">新テーマ候補データがありません</div>';
        }
    }

    // 世界の注目銘柄ウォッチ（#187 MVP・日米以外の手選び銘柄・価格/騰落のみ・詳細ページなし）
    // 地域タブで切替表示（2026-07-16 ユーザー指示: タブUI化）
    async loadWorldWatch() {
        const el = document.getElementById('world-watch-list');
        if (!el) return;
        try {
            const res = await fetch('/api/world_watch.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const regions = data.regions || [];
            if (regions.length === 0) {
                el.innerHTML = '<div class="no-data">世界ウォッチデータがありません</div>';
                return;
            }
            const fmtPct = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);
            const pctCls = (v) => (v == null ? 'neutral' : v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral');
            const arrow = (v) => (v == null ? '' : v > 0 ? '▲' : v < 0 ? '▼' : '');
            const renderRegion = (rg) => (rg.items || []).map((s) => `
                    <div class="ranking-item">
                        <div class="ranking-item-left">
                            <div class="ranking-symbol">${s.ticker}</div>
                            <div class="ranking-name">${s.name}</div>
                            <div class="ranking-name" style="font-size:.8em;opacity:.85">
                                5日 <span class="${pctCls(s.chg_5d)}">${fmtPct(s.chg_5d)}</span>
                                1ヶ月 <span class="${pctCls(s.chg_1mo)}">${fmtPct(s.chg_1mo)}</span>
                            </div>
                        </div>
                        <div class="ranking-item-right">
                            <div class="ranking-values">
                                <div class="ranking-value">${(s.price || 0).toLocaleString()} <span style="font-size:.75em;opacity:.7">${s.currency || ''}</span></div>
                                <div class="ranking-change ${pctCls(s.chg_1d)}">${arrow(s.chg_1d)} 前日 ${fmtPct(s.chg_1d)}</div>
                            </div>
                        </div>
                    </div>`).join('');
            const tabs = regions.map((rg, i) =>
                `<button class="tab-button ww-tab${i === 0 ? ' active' : ''}" data-ww-region="${i}" aria-pressed="${i === 0}">${rg.region}</button>`
            ).join('');
            const panes = regions.map((rg, i) =>
                `<div class="ww-region${i === 0 ? '' : ' hidden'}" data-ww-pane="${i}">${renderRegion(rg)}</div>`
            ).join('');
            el.innerHTML = `<div class="ranking-tabs ww-tabs">${tabs}</div>${panes}`;
            el.querySelectorAll('.ww-tab').forEach((btn) => {
                btn.addEventListener('click', () => {
                    el.querySelectorAll('.ww-tab').forEach((b) => {
                        b.classList.toggle('active', b === btn);
                        b.setAttribute('aria-pressed', String(b === btn));
                    });
                    const idx = btn.getAttribute('data-ww-region');
                    el.querySelectorAll('[data-ww-pane]').forEach((p) => {
                        p.classList.toggle('hidden', p.getAttribute('data-ww-pane') !== idx);
                    });
                });
            });
        } catch (e) {
            el.innerHTML = '<div class="no-data">世界ウォッチデータがありません</div>';
        }
    }

    // P2 情報過多の整理（#192・2026-07-16）: カテゴリ内のランキングカードが多い場合、
    // 初期表示を6枚に絞り「もっと見る」で展開する（fintech BP: 初期ビュー5-6カード以内）
    setupCardCollapse(maxVisible = 6) {
        document.querySelectorAll('.ranking-category .rankings-grid').forEach((grid) => {
            if (grid.dataset.rkCollapse) return; // 二重適用防止
            const cards = Array.from(grid.querySelectorAll(':scope > .ranking-card'));
            if (cards.length <= maxVisible) return;
            grid.dataset.rkCollapse = '1';
            const hidden = cards.slice(maxVisible);
            hidden.forEach((c) => c.classList.add('rk-collapsed'));
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rk-more-btn';
            btn.textContent = `他のランキングを表示（あと${hidden.length}種）`;
            btn.setAttribute('aria-expanded', 'false');
            btn.addEventListener('click', () => {
                const expanded = btn.getAttribute('aria-expanded') === 'true';
                hidden.forEach((c) => c.classList.toggle('rk-collapsed', expanded));
                btn.setAttribute('aria-expanded', String(!expanded));
                btn.textContent = expanded ? `他のランキングを表示（あと${hidden.length}種）` : '閉じる';
            });
            grid.after(btn);
        });
    }

    // #194 ①ショートカード概観の詳細ドリルダウン。各ランキングカードは既定で上位5件
    // だけを表示（CSS の nth-child キャップ）し、末尾の「全て見る」トグルで当該カードの
    // みを全件展開する（rk-card-expanded）。データ再取得は不要で、既に描画済みの
    // .ranking-item を CSS で出し分けるだけ。6件未満のカードでは CSS(:has) がトグルを隠す。
    setupRankingDrilldown() {
        document.querySelectorAll('.rankings-section .ranking-card').forEach((card) => {
            if (card.dataset.rkDrill) return; // 二重適用防止
            const list = card.querySelector('.ranking-list');
            if (!list) return;
            card.dataset.rkDrill = '1';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rk-toggle-all';
            btn.textContent = '全て見る →';
            btn.setAttribute('aria-expanded', 'false');
            btn.addEventListener('click', () => {
                const expanded = card.classList.toggle('rk-card-expanded');
                btn.setAttribute('aria-expanded', String(expanded));
                btn.textContent = expanded ? '閉じる ▲' : '全て見る →';
                if (!expanded) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
            card.appendChild(btn);
        });
    }

    // #193 セクション折りたたみ（setupCardCollapse を一般化）: data-collapsible を持つ
    // トップレベルセクションの本文を折りたたみ、見出しをトグルボタン化する。
    // data-collapsed="true" で初期折りたたみ。.rk-collapsed / aria-expanded の既存規約を流用。
    setupSectionCollapse() {
        document.querySelectorAll('.rankings-section[data-collapsible]').forEach((sec) => {
            if (sec.dataset.rkSectionInit) return; // 二重適用防止
            const h2 = sec.querySelector(':scope > h2');
            if (!h2) return;
            sec.dataset.rkSectionInit = '1';

            // 見出し以降の兄弟要素を本文ラッパへ移動
            const body = document.createElement('div');
            body.className = 'rk-section-body';
            let node = h2.nextSibling;
            while (node) {
                const next = node.nextSibling;
                body.appendChild(node);
                node = next;
            }
            sec.appendChild(body);

            // 見出しをトグルボタン化（元の見出し内容をボタンへ移す）
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rk-section-toggle';
            while (h2.firstChild) btn.appendChild(h2.firstChild);
            const caret = document.createElement('span');
            caret.className = 'rk-section-caret';
            caret.setAttribute('aria-hidden', 'true');
            btn.appendChild(caret);
            h2.appendChild(btn);

            const setState = (collapsed) => {
                body.classList.toggle('rk-collapsed', collapsed);
                btn.setAttribute('aria-expanded', String(!collapsed));
            };
            setState(sec.dataset.collapsed === 'true');

            btn.addEventListener('click', () => {
                const expanded = btn.getAttribute('aria-expanded') === 'true';
                setState(expanded); // 展開中なら折りたたむ
            });
        });
    }

    // #193 折りたたみ状態のセクションを展開してからスムーズスクロール（目次ピル・直リンク共用）
    expandAndScrollTo(id) {
        const target = document.getElementById(id);
        if (!target) return;
        const btn = target.querySelector(':scope > h2 .rk-section-toggle');
        if (btn && btn.getAttribute('aria-expanded') === 'false') {
            btn.click();
        }
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // #193 横スティッキー・セクション目次のピル。折りたたみ自動展開に対応。
    setupSectionNav() {
        document.querySelectorAll('.rk-section-nav a').forEach((a) => {
            a.addEventListener('click', (e) => {
                const href = a.getAttribute('href') || '';
                if (!href.startsWith('#')) return;
                e.preventDefault();
                this.expandAndScrollTo(href.slice(1));
                if (history.replaceState) history.replaceState(null, '', href);
            });
        });
        // 直リンク（#アンカー付きでページを開いた場合）も自動展開
        if (location.hash && location.hash.length > 1) {
            const id = location.hash.slice(1);
            setTimeout(() => this.expandAndScrollTo(id), 300);
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
        document.querySelectorAll('[data-jp-view]').forEach(b => {
            const on = b.dataset.jpView === mode;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on);   // P5: トグル状態をスクリーンリーダーに通知
        });
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
            { key: 'up_streak', label: '連騰' },
        ];
        const thead = '<thead><tr>' + cols.map(c => {
            const sortCls = (c.key === key) ? (dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
            // P5: 指標ツールチップ＋キーボード/スクリーンリーダー対応
            const help = METRIC_HELP[c.key] ? ` title="${METRIC_HELP[c.key]}"` : '';
            const ariaSort = (c.key === key) ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';
            const a11y = (c.key === 'sym') ? '' : ` tabindex="0" role="button" aria-sort="${ariaSort}" aria-label="${c.label}で並べ替え"`;
            return `<th class="${[c.cls, sortCls].filter(Boolean).join(' ')}" data-sort="${c.key}"${help}${a11y}>${c.label}</th>`;
        }).join('') + '</tr></thead>';
        const fmtVol = v => { v = Number(v) || 0; if (v >= 1e8) return (v / 1e8).toFixed(1) + '億'; if (v >= 1e4) return Math.round(v / 1e4).toLocaleString('ja-JP') + '万'; return v ? String(v) : '—'; };
        const fmtCap = v => { v = Number(v) || 0; if (v >= 1e12) return (v / 1e12).toFixed(1) + '兆'; if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'; return v ? String(v) : '—'; };
        const num = (v, d, suf = '') => (v != null && !isNaN(Number(v))) ? Number(v).toFixed(d) + suf : '—';
        // 連騰日数: 前日比プラスの連続日数。+3%以上の急騰が3日以上続く場合は 🔥 を付す（§31 ランナーの目安）
        const fmtStreak = r => { const u = Number(r.up_streak) || 0; if (!u) return '—'; const s = Number(r.surge_streak) || 0; return (s >= 3 ? '🔥' : '') + u + '日'; };
        const body = '<tbody>' + rows.map(r => {
            const chg = Number(r.period_change);
            const chgCls = (chg > 0) ? 'pos' : (chg < 0 ? 'neg' : '');
            const chgTxt = (r.period_change != null && !isNaN(chg)) ? (chg > 0 ? '▲+' : (chg < 0 ? '▼' : '')) + chg.toFixed(2) + '%' : '—';
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
                + `<td>${fmtStreak(r)}</td>`
                + `</tr>`;
        }).join('') + '</tbody>';
        table.innerHTML = thead + body;
        table.querySelectorAll('thead th[data-sort]').forEach(th => {
            // P5: Enter/Space でもソート（キーボード操作対応）
            th.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); th.click(); }
            });
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
        document.querySelectorAll('[data-us-view]').forEach(b => {
            const on = b.dataset.usView === mode;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on);   // P5: トグル状態をスクリーンリーダーに通知
        });
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
            { key: 'up_streak', label: '連騰' },
        ];
        const thead = '<thead><tr>' + cols.map(c => {
            const sortCls = (c.key === key) ? (dir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
            // P5: 指標ツールチップ＋キーボード/スクリーンリーダー対応
            const help = METRIC_HELP[c.key] ? ` title="${METRIC_HELP[c.key]}"` : '';
            const ariaSort = (c.key === key) ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';
            const a11y = (c.key === 'sym') ? '' : ` tabindex="0" role="button" aria-sort="${ariaSort}" aria-label="${c.label}で並べ替え"`;
            return `<th class="${[c.cls, sortCls].filter(Boolean).join(' ')}" data-sort="${c.key}"${help}${a11y}>${c.label}</th>`;
        }).join('') + '</tr></thead>';
        const fmtVol = v => { v = Number(v) || 0; if (v >= 1e8) return (v / 1e8).toFixed(1) + '億'; if (v >= 1e4) return Math.round(v / 1e4).toLocaleString('ja-JP') + '万'; return v ? String(v) : '—'; };
        const fmtCap = v => { v = Number(v) || 0; if (v >= 1e12) return '$' + (v / 1e12).toFixed(1) + 'T'; if (v >= 1e9) return '$' + (v / 1e9).toFixed(0) + 'B'; if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M'; return v ? String(v) : '—'; };
        const num = (v, d) => (v != null && !isNaN(Number(v))) ? Number(v).toFixed(d) : '—';
        // 連騰日数: 前日比プラスの連続日数。+3%以上の急騰が3日以上続く場合は 🔥（§31 ランナーの目安）
        const fmtStreak = r => { const u = Number(r.up_streak) || 0; if (!u) return '—'; const s = Number(r.surge_streak) || 0; return (s >= 3 ? '🔥' : '') + u + '日'; };
        const body = '<tbody>' + rows.map(r => {
            const chg = Number(r.period_change);
            const chgCls = (chg > 0) ? 'pos' : (chg < 0 ? 'neg' : '');
            const chgTxt = (r.period_change != null && !isNaN(chg)) ? (chg > 0 ? '▲+' : (chg < 0 ? '▼' : '')) + chg.toFixed(2) + '%' : '—';
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
                + `<td>${fmtStreak(r)}</td>`
                + `</tr>`;
        }).join('') + '</tbody>';
        table.innerHTML = thead + body;
        table.querySelectorAll('thead th[data-sort]').forEach(th => {
            // P5: Enter/Space でもソート（キーボード操作対応）
            th.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); th.click(); }
            });
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
            if (!periodSection) { this.renderUSEmpty('この期間の米国ランキングはデータ未生成です（次回のデータ更新で対応予定）'); return; }
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

            const rankCls = rank <= 3 ? 'ranking-rank top' : 'ranking-rank';
            const sparkHtml = (Array.isArray(stock.spark) && stock.spark.length >= 2)
                ? `<canvas class="ranking-spark" data-spark='${JSON.stringify(stock.spark)}' aria-hidden="true"></canvas>` : '';
            return `
                <div class="ranking-item" onclick="if(typeof gtag==='function')gtag('event','ranking_item_click',{symbol:'${stock.symbol}'});window.location.href='/stocks/detail/?s=${encodeURIComponent(stock.symbol)}'" style="cursor:pointer;">
                    <div class="ranking-item-left">
                        <span class="${rankCls}">${rank}</span>
                        <div class="ranking-labels">
                            <span class="ranking-symbol">${stock.symbol}</span>
                            <span class="ranking-name">${stock.name}</span>
                        </div>
                    </div>
                    <div class="ranking-item-right">
                        ${sparkHtml}
                        <div class="ranking-values">
                            <span class="ranking-value">${valueText}</span>
                            <span class="ranking-change ${changeClass}">${changeClass === 'positive' ? '▲' : changeClass === 'negative' ? '▼' : ''}${changeText}</span>
                        </div>
                        <button class="btn-star" data-symbol="${stock.symbol}" onclick="event.stopPropagation(); toggleWatchlist('${stock.symbol}')" title="ウォッチリストに追加">⭐</button>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
        // スパークライン描画（spark を持つ行のみ・DOM 反映後）
        container.querySelectorAll('canvas.ranking-spark').forEach(cv => {
            try { this.drawMiniSpark(cv, JSON.parse(cv.dataset.spark)); } catch (e) {}
        });
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
        
        const lastUpdated = document.getElementById('last-updated-time');
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

        // 🔥 継続上昇＆業種集中度（当日急騰×5日継続・period 非依存の単発描画）
        this.updateMomentumHighlight('jp', 'jp-continuation-ranking', 'jp-concentration');
        this.updateMomentumHighlight('us', 'us-continuation-ranking', 'us-concentration');

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
            // 売残が極小だと倍率が発散する（151倍等）ため 100倍超は ">100" にクリップ表示
            const mr = item.margin_ratio;
            const mrTxt = mr == null ? '--' : (mr >= 100 ? '>100（売残僅少）' : mr.toFixed(2));
            valueDisplay = `信用倍率 ${mrTxt}倍`;
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

// ⑥相対強度: 指数超過（α）ランキングカードを period_rankings の alpha_high で更新する。
// デイリー含む全期間で period_rankings.json 由来（enhanced には α が無いため）。
// ⑤業種フロー（updateSectorFlow）も同じタイミングでまとめて更新する。
Dashboard.prototype.updateAlphaRanking = function(period) {
    const pd = this.periodRankingsData && this.periodRankingsData[period];
    const list = pd && pd.rankings && pd.rankings.alpha_high;
    this.updatePeriodRankingList('alpha-ranking', list || []);
    this.updateSectorFlow(period);
    this.updateDivergenceWatch(period);
    this.updateDividendTrap(period);
};

// ⚠️ 要注意（業種逆行）: 業種と反対に動く銘柄（独歩高/独歩安）。period_rankings の divergence_watch 由来。
// info マーカー（買い/売りシグナルではない）。乖離の大きい順。
Dashboard.prototype.updateDivergenceWatch = function(period) {
    const el = document.getElementById('divergence-watch-ranking');
    if (!el) return;
    const pd = this.periodRankingsData && this.periodRankingsData[period];
    const list = (pd && pd.rankings && pd.rankings.divergence_watch) || [];
    if (!list.length) {
        el.innerHTML = '<div class="no-data">該当なし（業種と逆行する銘柄は現在なし）</div>';
        return;
    }
    el.innerHTML = list.map((s, i) => {
        const up = s.divergence_flag === '独歩高';
        const badge = up ? '独歩高' : '独歩安';
        const badgeCls = up ? 'positive' : 'negative';
        const pc = Number(s.period_change);
        const sec = Number(s.sector_change);
        const gap = Number(s.sector_divergence);
        return `
            <div class="ranking-item" onclick="window.location.href='/stocks/detail/?s=${encodeURIComponent(s.symbol || '')}'" style="cursor:pointer;" title="業種平均 ${sec.toFixed(1)}% に対し ${pc.toFixed(1)}%（乖離 ${gap.toFixed(1)}pt）">
                <div class="ranking-item-left">
                    <span class="ranking-rank">${i + 1}</span>
                    <div class="ranking-labels">
                        <span class="ranking-symbol">${s.symbol || ''} <span class="ranking-change ${badgeCls}">${badge}</span></span>
                        <span class="ranking-name">${s.name || s.symbol || ''}</span>
                    </div>
                </div>
                <div class="ranking-item-right">
                    <div class="ranking-values">
                        <div class="ranking-value">銘柄${pc > 0 ? '+' : ''}${pc.toFixed(1)}%</div>
                        <div class="ranking-change ${badgeCls}">業種${sec > 0 ? '+' : ''}${sec.toFixed(1)}%</div>
                    </div>
                </div>
            </div>`;
    }).join('');
};

// 🚫 配当トラップ注意: 高配当だが下落トレンド（MA75割れ）×小型＝減配/バリュートラップ。買い候補から外す参考。
// info マーカー（買い/売りシグナルではない）。period_rankings の dividend_trap 由来。
Dashboard.prototype.updateDividendTrap = function(period) {
    const el = document.getElementById('dividend-trap-ranking');
    if (!el) return;
    const pd = this.periodRankingsData && this.periodRankingsData[period];
    const list = (pd && pd.rankings && pd.rankings.dividend_trap) || [];
    if (!list.length) {
        el.innerHTML = '<div class="no-data">該当なし（高配当×下落トレンドの銘柄なし）</div>';
        return;
    }
    el.innerHTML = list.map((s, i) => {
        const y = Number(s.dividend_yield);
        return `
            <div class="ranking-item" onclick="window.location.href='/stocks/detail/?s=${encodeURIComponent(s.symbol || '')}'" style="cursor:pointer;" title="${s.trap_reason || ''}">
                <div class="ranking-item-left">
                    <span class="ranking-rank">${i + 1}</span>
                    <div class="ranking-labels">
                        <span class="ranking-symbol">${s.symbol || ''}${s.small_cap ? ' <span class="ranking-change negative">小型</span>' : ''}</span>
                        <span class="ranking-name">${s.name || s.symbol || ''}</span>
                    </div>
                </div>
                <div class="ranking-item-right">
                    <div class="ranking-values">
                        <div class="ranking-value">配当${y.toFixed(1)}%</div>
                        <div class="ranking-change negative">下落トレンド</div>
                    </div>
                </div>
            </div>`;
    }).join('');
};

// ⑤業種フロー: 17業種別の平均騰落率カード（強い業種→弱い業種・首位銘柄クリックで詳細へ）
Dashboard.prototype.updateSectorFlow = function(period) {
    const el = document.getElementById('sector-flow-ranking');
    if (!el) return;
    const pd = this.periodRankingsData && this.periodRankingsData[period];
    const list = (pd && pd.rankings && pd.rankings.sector_flow) || [];
    if (!list.length) {
        el.innerHTML = '<div class="no-data">データがありません（次回データ更新で反映）</div>';
        return;
    }
    el.innerHTML = list.map((s, i) => {
        const cls = s.avg_change > 0 ? 'positive' : (s.avg_change < 0 ? 'negative' : 'neutral');
        const arrow = s.avg_change > 0 ? '▲+' : (s.avg_change < 0 ? '▼' : '');
        const rankCls = i < 3 ? 'ranking-rank top' : 'ranking-rank';
        const topLabel = s.top_name || s.top_symbol || '';
        return `
            <div class="ranking-item" onclick="window.location.href='/stocks/detail/?s=${encodeURIComponent(s.top_symbol || '')}'" style="cursor:pointer;" title="首位 ${topLabel} の詳細を開く">
                <div class="ranking-item-left">
                    <span class="${rankCls}">${i + 1}</span>
                    <div class="ranking-labels">
                        <span class="ranking-symbol">${s.sector17}</span>
                        <span class="ranking-name">${s.count}銘柄・首位 ${topLabel}</span>
                    </div>
                </div>
                <div class="ranking-item-right">
                    <div class="ranking-values">
                        <div class="ranking-value">平均</div>
                        <div class="ranking-change ${cls}">${arrow}${Number(s.avg_change).toFixed(2)}%</div>
                    </div>
                </div>
            </div>`;
    }).join('');
};

// 🔥 継続上昇＆業種集中度: 当日急騰(daily>=+3%)×5日継続プラスの銘柄と、当日急騰上位の業種偏り。
// period_rankings の momentum(jp/us) 由来。当日+5日固定のため period タブ非依存の単発描画。
// info マーカー（買い/売りシグナルではない）。
Dashboard.prototype.updateMomentumHighlight = function(market, listElId, concElId) {
    const mom = this.periodRankingsData && this.periodRankingsData.momentum;
    const data = (mom && mom[market]) || {};
    const cont = data.continuation || [];
    const listEl = document.getElementById(listElId);
    if (listEl) {
        if (!cont.length) {
            listEl.innerHTML = '<div class="no-data">該当なし（当日急騰かつ5日継続の銘柄なし）</div>';
        } else {
            listEl.innerHTML = cont.map((s, i) => {
                const d = Number(s.period_change);
                const f5 = Number(s.change_5d);
                const rankCls = i < 3 ? 'ranking-rank top' : 'ranking-rank';
                return `
                    <div class="ranking-item" onclick="window.location.href='/stocks/detail/?s=${encodeURIComponent(s.symbol || '')}'" style="cursor:pointer;" title="当日 ${d.toFixed(1)}% / 5日 ${f5.toFixed(1)}%（勢い継続）">
                        <div class="ranking-item-left">
                            <span class="${rankCls}">${i + 1}</span>
                            <div class="ranking-labels">
                                <span class="ranking-symbol">${s.symbol || ''}</span>
                                <span class="ranking-name">${s.name || s.symbol || ''}</span>
                            </div>
                        </div>
                        <div class="ranking-item-right">
                            <div class="ranking-values">
                                <div class="ranking-value">当日 ${d > 0 ? '+' : ''}${d.toFixed(1)}%</div>
                                <div class="ranking-change positive">5日 ${f5 > 0 ? '+' : ''}${f5.toFixed(1)}%</div>
                            </div>
                        </div>
                    </div>`;
            }).join('');
        }
    }
    const concEl = document.getElementById(concElId);
    if (concEl) {
        const conc = data.concentration || [];
        if (!conc.length) {
            concEl.innerHTML = '';
        } else {
            const total = data.top_gainer_count || 0;
            const top = conc[0];
            const badge = (top && top.share >= 40)
                ? ` <span class="ranking-change positive">${top.sector}に集中</span>` : '';
            const chips = conc.slice(0, 6).map(c =>
                `<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;border-radius:10px;background:#f3f4f6;color:#374151;font-size:0.8em;">${c.sector}：${c.count}件(${c.share}%)</span>`
            ).join('');
            concEl.innerHTML = `<div style="font-size:0.82em;color:#6b7280;margin:8px 0 4px;">業種集中度（当日急騰上位${total}銘柄）${badge}</div><div>${chips}</div>`;
        }
    }
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
            this.updateAlphaRanking('daily');
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
        this.updateAlphaRanking(this.currentPeriod);
    }
};

// P5: 指標ツールチップ（テーブル見出し title / aria-label 用）
const METRIC_HELP = {
    current_price: '直近の株価',
    period_change: '選択期間の騰落率',
    period_volume: '選択期間の出来高合計（デイリー=当日）',
    market_cap: '時価総額（株価×発行済株式数）',
    pe_ratio: 'PER=株価収益率。株価が1株利益の何倍か（低いほど割安の目安）',
    pb_ratio: 'PBR=株価純資産倍率。1倍近辺が解散価値の目安',
    dividend_yield: '配当利回り（年間配当÷株価・%）',
    rsi: 'RSI=相対力指数。70以上は買われすぎ・30以下は売られすぎの目安',
    deviation_25: '25日移動平均線からの乖離率。±20%超は過熱/急落の目安',
    short_ratio: '空売り比率（日数換算）。高いほど踏み上げ余地',
    up_streak: '連騰日数=前日比プラスが続いた連続営業日数。🔥は+3%以上の急騰が3日以上連続（§31 ランナーの目安）',
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
        if (elementId.includes('alpha')) {
            // ⑥相対強度: 値欄に指数超過リターン（α）を表示（騰落欄は生の期間騰落率）
            valueDisplay = (item.alpha != null)
                ? `α ${Number(item.alpha) > 0 ? '+' : ''}${Number(item.alpha).toFixed(2)}%` : '--';
        } else if (elementId.includes('rsi')) {
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
        
        // P4 視覚的階層: 順位バッジ・スパークライン。spark があればカードに埋め込む
        const rankCls = index < 3 ? 'ranking-rank top' : 'ranking-rank';
        const sparkAttr = (Array.isArray(item.spark) && item.spark.length >= 2)
            ? ` data-spark='${JSON.stringify(item.spark)}'` : '';
        const sparkHtml = sparkAttr
            ? `<canvas class="ranking-spark"${sparkAttr} aria-hidden="true"></canvas>` : '';
        return `
            <div class="ranking-item" onclick="if(typeof gtag==='function')gtag('event','ranking_item_click',{symbol:'${item.symbol}'});window.location.href='/stocks/detail/?s=${encodeURIComponent(item.symbol)}'">
                <div class="ranking-item-left">
                    <span class="${rankCls}">${index + 1}</span>
                    <div class="ranking-labels">
                        <div class="ranking-symbol">${item.symbol}</div>
                        <div class="ranking-name">${item.name}</div>
                    </div>
                </div>
                <div class="ranking-item-right">
                    ${sparkHtml}
                    <div class="ranking-values">
                        <div class="ranking-value">${valueDisplay}</div>
                        <div class="ranking-change ${changeClass}">${changeClass === 'positive' ? '▲' : changeClass === 'negative' ? '▼' : ''}${formattedChange}</div>
                    </div>
                    <span class="watchlist-star" onclick="event.stopPropagation(); toggleWatchlist('${item.symbol}')">⭐</span>
                </div>
            </div>
        `;
    }).join('');

    element.innerHTML = html;
    // スパークライン描画（DOM 反映後）
    element.querySelectorAll('canvas.ranking-spark').forEach(cv => {
        try { this.drawMiniSpark(cv, JSON.parse(cv.dataset.spark)); } catch (e) {}
    });
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
        this.updateAlphaRanking('daily');
        return;
    }

    // ウィークリー・マンスリー・3ヶ月・6ヶ月・YTD: period_rankings データを使用
    if (this.periodRankingsData && this.periodRankingsData[period]) {
        const rankings = this.periodRankingsData[period].rankings;
        this.updatePeriodRankingList('gainers-ranking', rankings.gainers || []);
        this.updatePeriodRankingList('losers-ranking', rankings.losers || []);
        this.updatePeriodRankingList('volume-ranking', rankings.volume || []);
        this.updatePeriodRankingList('market-cap-ranking', rankings.market_cap || []);
        this.updateAlphaRanking(period);
    } else {
        // タスク3: 追加プリセット等でその期間のデータが JSON に未生成の場合の「データなし」表示。
        // （次回のデータ更新で period_rankings.json に該当キーが生成され自動反映される）
        this.renderPeriodNoData();
    }
};

// タスク3: 選択期間のデータが未生成のとき、JP 基本ランキング枠に「データなし」を表示する。
Dashboard.prototype.renderPeriodNoData = function() {
    const msg = '<div class="no-data">この期間のデータは未生成です（次回のデータ更新で対応予定）</div>';
    ['gainers-ranking', 'losers-ranking', 'volume-ranking', 'market-cap-ranking',
     'alpha-ranking', 'sector-flow-ranking', 'divergence-watch-ranking',
     'dividend-trap-ranking'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = msg;
    });
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
    // 2026-07-08 日次AI予測ランキングは廃止（BTでナイーブ基準に劣後確定・生成停止済み）。
    // 月次のAI銘柄ランキング（ml-ranking-section）は loadMLRanking 側で継続。
    return;
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

/* ============================================================================
 * #215 ランキング スクリーナー（Yahoo!ファイナンス／みんかぶ型・1画面1ランキング）
 * 上部 市場スイッチ(日本/米国/全部)＋期間タブ / 左サイドバー グループ化ナビ /
 * メイン 単一テーブル＋全件ページ送り（50件/ページ・件数非依存）。
 * データ源: extended_rankings.json（JP・種別多）/ period_rankings.json（daily.. と us_*・期間連動）/
 *           ml_monthly_ranking(.json/_us)（AI月次・all に全件）。
 * JSONスキーマは現状維持（配列要素数だけ増える前提）＝件数非依存で描画。
 * ==========================================================================*/
const RK_PAGE_SIZE = 50;

// 列ごとのフォーマッタ（市場で通貨/単位を出し分け）
const RK_FMT = {
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    price(n) {
        const v = n.price;
        if (v == null || isNaN(Number(v))) return '—';
        return (n.market === 'us' ? '$' : '¥') + Number(v).toLocaleString('en', { maximumFractionDigits: 2 });
    },
    change(n) {
        const c = Number(n.change);
        if (n.change == null || isNaN(c)) return '<span class="rk-cell">—</span>';
        const cls = c > 0 ? 'rk-pos' : (c < 0 ? 'rk-neg' : '');
        const arrow = c > 0 ? '▲+' : (c < 0 ? '▼' : '');
        return `<span class="rk-cell ${cls}">${arrow}${c.toFixed(2)}%</span>`;
    },
    signPct(v, d) {
        if (v == null || isNaN(Number(v))) return '<span class="rk-cell">—</span>';
        const x = Number(v); const cls = x > 0 ? 'rk-pos' : (x < 0 ? 'rk-neg' : '');
        return `<span class="rk-cell ${cls}">${x > 0 ? '+' : ''}${x.toFixed(d)}%</span>`;
    },
    pct(v, d) { return (v == null || isNaN(Number(v))) ? '—' : Number(v).toFixed(d) + '%'; },
    num(v, d, suf) { return (v == null || isNaN(Number(v))) ? '—' : Number(v).toFixed(d) + (suf || ''); },
    vol(v) {
        v = Number(v) || 0;
        if (v >= 1e8) return (v / 1e8).toFixed(1) + '億';
        if (v >= 1e4) return Math.round(v / 1e4).toLocaleString('ja-JP') + '万';
        return v ? String(v) : '—';
    },
    cap(n) {
        const v = Number(n.market_cap) || 0;
        if (!v) return '—';
        if (n.market === 'us') {
            if (v >= 1e12) return '$' + (v / 1e12).toFixed(1) + 'T';
            if (v >= 1e9) return '$' + (v / 1e9).toFixed(0) + 'B';
            if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M';
            return '$' + v;
        }
        if (v >= 1e12) return (v / 1e12).toFixed(1) + '兆';
        if (v >= 1e8) return (v / 1e8).toFixed(0) + '億';
        return String(v);
    },
    tradingValue(n) {
        const v = Number(n.trading_value) || 0;
        if (!v) return '—';
        if (n.market === 'us') { if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'; if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M'; return '$' + v; }
        if (v >= 1e12) return (v / 1e12).toFixed(2) + '兆'; if (v >= 1e8) return (v / 1e8).toFixed(0) + '億'; return String(v);
    },
    capJp(v) { // 売上高・純利益（円・JPのみ）
        v = Number(v) || 0; if (!v) return '—';
        if (Math.abs(v) >= 1e12) return (v / 1e12).toFixed(2) + '兆'; if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(0) + '億'; return String(v);
    },
    finCap(n, v) { // 売上高・純利益（市場で通貨を出し分け・#188 US対応）
        v = Number(v) || 0; if (!v) return '—';
        if (n.market === 'us') {
            if (Math.abs(v) >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
            if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
            if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M';
            return '$' + v;
        }
        return RK_FMT.capJp(v);
    },
    streak(n) {
        const u = Number(n.up_streak) || 0; if (!u) return '—';
        const s = Number(n.surge_streak) || 0; return (s >= 3 ? '🔥' : '') + u + '日';
    },
};

// 列レジストリ: id → { label, cls, r(n)描画 }（rank/name は特殊描画）
const RK_COLS = {
    rank:        { label: '#',        cls: 'rk-c-rank' },
    name:        { label: '銘柄',      cls: 'rk-c-name' },
    price:       { label: '取引値',    cls: 'rk-c-num', r: n => RK_FMT.price(n) },
    change:      { label: '前日比',    cls: 'rk-c-num', r: n => RK_FMT.change(n) },
    volume:      { label: '出来高',    cls: 'rk-c-num', r: n => RK_FMT.vol(n.volume) },
    mktcap:      { label: '時価総額',  cls: 'rk-c-num', r: n => RK_FMT.cap(n) },
    per:         { label: 'PER',       cls: 'rk-c-num', r: n => RK_FMT.num((n.per > 0 ? n.per : null), 1, '倍') },
    pbr:         { label: 'PBR',       cls: 'rk-c-num', r: n => RK_FMT.num((n.pbr > 0 ? n.pbr : null), 2, '倍') },
    psr:         { label: 'PSR',       cls: 'rk-c-num', r: n => RK_FMT.num((n.psr > 0 ? n.psr : null), 1, '倍') },
    divyield:    { label: '配当利回り', cls: 'rk-c-num', r: n => RK_FMT.pct(n.divyield, 2) },
    roe:         { label: 'ROE',       cls: 'rk-c-num', r: n => RK_FMT.pct(n.roe, 1) },
    roa:         { label: 'ROA',       cls: 'rk-c-num', r: n => RK_FMT.pct(n.roa, 1) },
    netmargin:   { label: '純利益率',  cls: 'rk-c-num', r: n => RK_FMT.pct(n.net_margin, 1) },
    dev25:       { label: '25日乖離',  cls: 'rk-c-num', r: n => RK_FMT.signPct(n.dev25, 1) },
    yearpos:     { label: '年初来位置', cls: 'rk-c-num', r: n => RK_FMT.pct(n.year_position, 0) },
    tradingvalue:{ label: '売買代金',  cls: 'rk-c-num', r: n => RK_FMT.tradingValue(n) },
    volratio:    { label: '出来高変化率', cls: 'rk-c-num', r: n => RK_FMT.pct(n.volume_ratio, 0) },
    streak:      { label: '連騰',      cls: 'rk-c-num', r: n => RK_FMT.streak(n) },
    revenue:     { label: '売上高',    cls: 'rk-c-num', r: n => RK_FMT.finCap(n, n.revenue) },
    netincome:   { label: '純利益',    cls: 'rk-c-num', r: n => RK_FMT.finCap(n, n.net_income) },
    alphaval:    { label: 'α超過',     cls: 'rk-c-num', r: n => RK_FMT.signPct(n.alpha, 1) },
    score:       { label: 'AIスコア',  cls: 'rk-c-num', r: n => RK_FMT.num(n.score, 3) },
    ret20:       { label: '20日騰落',  cls: 'rk-c-num', r: n => RK_FMT.signPct(n.ret20, 1) },
    ret120:      { label: '120日騰落', cls: 'rk-c-num', r: n => RK_FMT.signPct(n.ret120, 1) },
    rsi:         { label: 'RSI',       cls: 'rk-c-num', r: n => RK_FMT.num(n.rsi, 0) },
    sector:      { label: '業種',      cls: 'rk-c-sec', r: n => RK_FMT.esc(n.sector17 || '—') },
};

// 列セット（種別に応じて可変）。連騰列は日本株/米国株で維持（値は未再生成なら「—」）。
const RK_CS = {
    price:   ['rank', 'name', 'price', 'change', 'volume', 'streak'],
    volume:  ['rank', 'name', 'volume', 'volratio', 'tradingvalue', 'price', 'change'],
    tval:    ['rank', 'name', 'tradingvalue', 'volume', 'price', 'change'],
    mktcap:  ['rank', 'name', 'mktcap', 'price', 'change', 'volume'],
    per:     ['rank', 'name', 'per', 'price', 'change', 'mktcap'],
    pbr:     ['rank', 'name', 'pbr', 'price', 'change', 'mktcap'],
    psr:     ['rank', 'name', 'psr', 'price', 'change', 'mktcap'],
    div:     ['rank', 'name', 'divyield', 'price', 'change', 'mktcap'],
    dev25:   ['rank', 'name', 'dev25', 'price', 'change', 'volume'],
    yearpos: ['rank', 'name', 'yearpos', 'price', 'change', 'volume'],
    roe:     ['rank', 'name', 'roe', 'price', 'change', 'mktcap'],
    roa:     ['rank', 'name', 'roa', 'price', 'change', 'mktcap'],
    netmargin:['rank', 'name', 'netmargin', 'price', 'change', 'mktcap'],
    revenue: ['rank', 'name', 'revenue', 'price', 'change', 'mktcap'],
    netincome:['rank', 'name', 'netincome', 'price', 'change', 'mktcap'],
    cross:   ['rank', 'name', 'price', 'change', 'volume', 'dev25'],
    ml:      ['rank', 'name', 'score', 'ret20', 'ret120', 'rsi', 'sector'],
    alpha:   ['rank', 'name', 'alphaval', 'change', 'price', 'volume'],
};

// #188: us_rankings_full.json（US全銘柄×期間・spark除外）から period 系種別の対象行を絞る。
// ソートは _rkResolveRows（sortKey/dir）が行うためここではフィルタのみ。
const RK_US_FULL_FILTERS = {
    gainers: r => Number(r.period_change) > 0,
    losers: r => Number(r.period_change) < 0,
    volume: r => Number(r.period_volume != null ? r.period_volume : r.volume) > 0,
    volume_increase: r => Number(r.volume_ratio) > 100,
    market_cap: r => Number(r.market_cap) > 0,
    pe_high: r => Number(r.pe_ratio) > 0,
    pe_low: r => Number(r.pe_ratio) > 0,
    dividend_high: r => Number(r.dividend_yield) > 0,
    alpha_high: r => r.alpha != null && !isNaN(Number(r.alpha)),
};

// カタログ: グループ→種別。source=period(期間連動・JP+US) / extended(JP・スナップショット) / ml(AI月次・JP+US)
// sortKey は正規化フィールド名。dir=desc/asc。markets=想定対応市場（実データが空なら graceful に非表示）。
const RK_CATALOG = [
    // ── 株価変動 ──
    { id: 'gainers',  g: '株価変動', label: '値上がり率',       source: 'period',   key: 'gainers',            cs: 'price',   sortKey: 'change',        dir: 'desc', markets: ['jp', 'us'] },
    { id: 'losers',   g: '株価変動', label: '値下がり率',       source: 'period',   key: 'losers',             cs: 'price',   sortKey: 'change',        dir: 'asc',  markets: ['jp', 'us'] },
    { id: 'stophigh', g: '株価変動', label: 'ストップ高',       source: 'extended', key: 'stop_high',          cs: 'price',   sortKey: 'change',        dir: 'desc', markets: ['jp', 'us'] },
    { id: 'stoplow',  g: '株価変動', label: 'ストップ安',       source: 'extended', key: 'stop_low',           cs: 'price',   sortKey: 'change',        dir: 'asc',  markets: ['jp', 'us'] },
    { id: 'yhi',      g: '株価変動', label: '年初来高値更新',   source: 'extended', key: 'year_high_update',   cs: 'price',   sortKey: 'change',        dir: 'desc', markets: ['jp', 'us'] },
    { id: 'ylo',      g: '株価変動', label: '年初来安値更新',   source: 'extended', key: 'year_low_update',    cs: 'price',   sortKey: 'change',        dir: 'asc',  markets: ['jp', 'us'] },
    { id: 'dev25hi',  g: '株価変動', label: '25日乖離（高）',   source: 'extended', key: 'deviation_25_high',  cs: 'dev25',   sortKey: 'dev25',         dir: 'desc', markets: ['jp', 'us'] },
    { id: 'dev25lo',  g: '株価変動', label: '25日乖離（低）',   source: 'extended', key: 'deviation_25_low',   cs: 'dev25',   sortKey: 'dev25',         dir: 'asc',  markets: ['jp', 'us'] },
    { id: 'ypos_hi',  g: '株価変動', label: '年初来位置（高）', source: 'extended', key: 'year_position_high', cs: 'yearpos', sortKey: 'year_position', dir: 'desc', markets: ['jp', 'us'] },
    { id: 'ypos_lo',  g: '株価変動', label: '年初来位置（低）', source: 'extended', key: 'year_position_low',  cs: 'yearpos', sortKey: 'year_position', dir: 'asc',  markets: ['jp', 'us'] },
    // ── 出来高・売買代金 ──
    { id: 'volume',   g: '出来高・売買代金', label: '出来高',            source: 'period',   key: 'volume',            cs: 'volume', sortKey: 'volume',        dir: 'desc', markets: ['jp', 'us'] },
    { id: 'volinc',   g: '出来高・売買代金', label: '出来高変化率（増）', source: 'period',   key: 'volume_increase',   cs: 'volume', sortKey: 'volume_ratio',  dir: 'desc', markets: ['jp', 'us'] },
    { id: 'voldec',   g: '出来高・売買代金', label: '出来高変化率（減）', source: 'extended', key: 'volume_decrease',   cs: 'volume', sortKey: 'volume_ratio',  dir: 'asc',  markets: ['jp', 'us'] },
    { id: 'tvhi',     g: '出来高・売買代金', label: '売買代金（上位）',   source: 'extended', key: 'trading_value_high', cs: 'tval',  sortKey: 'trading_value', dir: 'desc', markets: ['jp', 'us'] },
    { id: 'tvlo',     g: '出来高・売買代金', label: '売買代金（下位）',   source: 'extended', key: 'trading_value_low',  cs: 'tval',  sortKey: 'trading_value', dir: 'asc',  markets: ['jp', 'us'] },
    // ── 規模・投資指標 ──
    { id: 'mcaphi',   g: '規模・投資指標', label: '時価総額（上位）', source: 'period',   key: 'market_cap',      cs: 'mktcap', sortKey: 'market_cap', dir: 'desc', markets: ['jp', 'us'] },
    { id: 'mcaplo',   g: '規模・投資指標', label: '時価総額（下位）', source: 'extended', key: 'market_cap_low',  cs: 'mktcap', sortKey: 'market_cap', dir: 'asc',  markets: ['jp', 'us'] },
    { id: 'pehi',     g: '規模・投資指標', label: 'PER（高）',       source: 'period',   key: 'pe_high',         cs: 'per',    sortKey: 'per',        dir: 'desc', markets: ['jp', 'us'] },
    { id: 'pelo',     g: '規模・投資指標', label: 'PER（低）',       source: 'period',   key: 'pe_low',          cs: 'per',    sortKey: 'per',        dir: 'asc',  markets: ['jp', 'us'] },
    { id: 'pbrhi',    g: '規模・投資指標', label: 'PBR（高）',       source: 'extended', key: 'pbr_high',        cs: 'pbr',    sortKey: 'pbr',        dir: 'desc', markets: ['jp', 'us'] },
    { id: 'pbrlo',    g: '規模・投資指標', label: 'PBR（低）',       source: 'extended', key: 'pbr_low',         cs: 'pbr',    sortKey: 'pbr',        dir: 'asc',  markets: ['jp', 'us'] },
    { id: 'psrhi',    g: '規模・投資指標', label: 'PSR（高）',       source: 'extended', key: 'psr_high',        cs: 'psr',    sortKey: 'psr',        dir: 'desc', markets: ['jp', 'us'] },
    { id: 'psrlo',    g: '規模・投資指標', label: 'PSR（低）',       source: 'extended', key: 'psr_low',         cs: 'psr',    sortKey: 'psr',        dir: 'asc',  markets: ['jp', 'us'] },
    { id: 'div',      g: '規模・投資指標', label: '配当利回り',      source: 'period',   key: 'dividend_high',   cs: 'div',    sortKey: 'divyield',   dir: 'desc', markets: ['jp', 'us'] },
    // ── 財務(企業) ──
    { id: 'roe',      g: '財務(企業)', label: 'ROE',      source: 'extended', key: 'roe_high',        cs: 'roe',       sortKey: 'roe',        dir: 'desc', markets: ['jp', 'us'] },
    { id: 'roa',      g: '財務(企業)', label: 'ROA',      source: 'extended', key: 'roa_high',        cs: 'roa',       sortKey: 'roa',        dir: 'desc', markets: ['jp', 'us'] },
    { id: 'netmargin',g: '財務(企業)', label: '純利益率', source: 'extended', key: 'net_margin_high', cs: 'netmargin', sortKey: 'net_margin', dir: 'desc', markets: ['jp', 'us'] },
    { id: 'revenue',  g: '財務(企業)', label: '売上高',   source: 'extended', key: 'revenue_high',    cs: 'revenue',   sortKey: 'revenue',    dir: 'desc', markets: ['jp', 'us'] },
    { id: 'netincome',g: '財務(企業)', label: '純利益',   source: 'extended', key: 'net_income_high', cs: 'netincome', sortKey: 'net_income', dir: 'desc', markets: ['jp', 'us'] },
    // ── テクニカル/AI ──
    { id: 'gc',       g: 'テクニカル/AI', label: 'ゴールデンクロス', source: 'extended', key: 'golden_cross', cs: 'cross', sortKey: 'change', dir: 'desc', markets: ['jp', 'us'] },
    { id: 'dc',       g: 'テクニカル/AI', label: 'デッドクロス',     source: 'extended', key: 'dead_cross',   cs: 'cross', sortKey: 'change', dir: 'asc',  markets: ['jp', 'us'] },
    { id: 'ml',       g: 'テクニカル/AI', label: 'AI月次ランキング', source: 'ml',       key: null,           cs: 'ml',    sortKey: 'score',  dir: 'desc', markets: ['jp', 'us'],
      note: 'クロスセクショナルML(LambdaRank)で今月相対的に強いと予測される順。BT: ベンチ超過 +3.7%/年(2018-2025)。⚠️相対強弱の参考であり買いシグナル・保証ではありません。' },
    { id: 'alpha',    g: 'テクニカル/AI', label: 'α（指数超過）',    source: 'period',   key: 'alpha_high',   cs: 'alpha', sortKey: 'alpha', dir: 'desc', markets: ['jp', 'us'],
      note: '期間騰落率から指数騰落率を引いた超過リターン。市場全体より強い銘柄の特定用。' },
];

const RK_PERIOD_LABELS = { daily: '日次', '5d': '5日', weekly: '週次', monthly: '月次', '3mo': '3ヶ月', '6mo': '6ヶ月', ytd: '年初来' };
const RK_MARKET_LABELS = { jp: '日本株', us: '米国株', all: '全部（日本株＋米国株）' };

Dashboard.prototype.initScreener = async function () {
    this.rk = { market: 'jp', period: 'daily', typeId: 'gainers', page: 0 };
    // データ取得（失敗しても部分描画できるよう個別 try）
    const getJson = async (url) => { try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch (e) { return null; } };
    const [ext, extUs, per, usFull, mlJp, mlUs] = await Promise.all([
        getJson('/api/extended_rankings.json'),
        getJson('/api/extended_rankings_us.json'),   // #188: US 拡張ランキング（全件）
        getJson('/api/period_rankings.json'),
        getJson('/api/us_rankings_full.json'),       // #188: US 全銘柄×期間フル配列
        getJson('/api/ml_monthly_ranking.json'),
        getJson('/api/ml_monthly_ranking_us.json'),
    ]);
    this.rkExt = ext || {};
    this.rkExtUs = extUs || {};
    this.rkPer = per || {};
    this.rkUsFull = usFull || {};
    this.rkMlJp = mlJp || {};
    this.rkMlUs = mlUs || {};

    // 各種別の実データ有無を市場別に判定（graceful なナビ生成用）
    this.rkAvail = {};
    RK_CATALOG.forEach(e => {
        const set = new Set();
        (e.markets || []).forEach(m => { if (this._rkRawArr(e, m, 'daily').length) set.add(m); });
        // 期間依存で daily に無くても他期間にあり得る period 種別は、markets を尊重して残す
        if (e.source === 'period') (e.markets || []).forEach(m => set.add(m));
        this.rkAvail[e.id] = set;
    });

    this._rkWireControls();
    this._rkWireViewSwitch();   // #215-followup: スクリーナー⇄マーケット概観 のビュー切替
    this._rkRenderSidebar();
    this._rkRender();
};

// ビュー切替（スクリーナー既定／マーケット概観）。概観は初回選択時のみ遅延描画（初期ロードを重くしない）。
Dashboard.prototype._rkWireViewSwitch = function () {
    const btns = document.querySelectorAll('[data-rk-view]');
    if (!btns.length) return;
    const screenerEl = document.getElementById('rk-view-screener');
    const overviewEl = document.getElementById('rk-overview');
    this._rkOverviewRendered = false;
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.rkView;
            btns.forEach(b => { const on = b === btn; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
            const showOverview = view === 'overview';
            if (screenerEl) screenerEl.hidden = showOverview;
            if (overviewEl) overviewEl.hidden = !showOverview;
            if (showOverview && !this._rkOverviewRendered) {
                this._rkOverviewRendered = true;
                this._rkRenderOverview();
            }
        });
    });
};

// マーケット概観の4セクション描画（既存の描画ロジックを流用）。
// データは initScreener で取得済みの this.rkPer（period_rankings.json）＋ theme/world は個別 fetch。
Dashboard.prototype._rkRenderOverview = function () {
    // updateSectorFlow / updateMomentum 系は this.periodRankingsData を参照するため、取得済み period データを橋渡し。
    this.periodRankingsData = this.rkPer || {};
    // ①業種フロー（日本株 日次・17業種）
    try { this.updateSectorFlow('daily'); } catch (e) { /* graceful */ }
    // ⑤継続上昇＆業種集中度（当日急騰×5日継続・period 非依存の単発描画。データ無は関数内で「該当なし」）
    try {
        this.updateMomentumHighlight('jp', 'jp-continuation-ranking', 'jp-concentration');
        this.updateMomentumHighlight('us', 'us-continuation-ranking', 'us-concentration');
    } catch (e) { /* graceful */ }
    // ④信用残（週次・各上位5件のみ＝概観として簡潔に）
    const marginRk = (this.rkPer && this.rkPer.margin && this.rkPer.margin.rankings) || {};
    this.updateMarginRankingList('margin-ratio-high-ranking', (marginRk.margin_ratio_high || []).slice(0, 5));
    this.updateMarginRankingList('long-increase-ranking', (marginRk.long_increase || []).slice(0, 5));
    this.updateMarginRankingList('short-increase-ranking', (marginRk.short_increase || []).slice(0, 5));
    // ③新テーマ候補（上位8件のみ）／②世界ウォッチ（地域タブ）＝それぞれ個別 fetch・データ無/古は関数内で graceful
    this.loadThemeCandidates(8);
    this.loadWorldWatch();
};

// 指定 種別×市場×期間 の生配列を返す（正規化前）
Dashboard.prototype._rkRawArr = function (entry, market, period) {
    if (entry.source === 'period') {
        if (market === 'us') {
            // #188: US 全銘柄フル配列があれば全件ページ送り（無ければ従来の us_* 上位10件にフォールバック）
            const full = this.rkUsFull && this.rkUsFull.periods && this.rkUsFull.periods[period];
            const flt = RK_US_FULL_FILTERS[entry.key];
            if (Array.isArray(full) && full.length && flt) return full.filter(flt);
        }
        const pk = market === 'us' ? 'us_' + period : period;
        const sec = this.rkPer && this.rkPer[pk];
        return (sec && sec.rankings && Array.isArray(sec.rankings[entry.key])) ? sec.rankings[entry.key] : [];
    }
    if (entry.source === 'extended') {
        const src = market === 'us' ? this.rkExtUs : this.rkExt;   // #188: US 拡張ランキング対応
        return (src && Array.isArray(src[entry.key])) ? src[entry.key] : [];
    }
    if (entry.source === 'ml') {
        const src = market === 'us' ? this.rkMlUs : this.rkMlJp;
        return (src && Array.isArray(src.all)) ? src.all : [];
    }
    return [];
};

Dashboard.prototype._rkNormalize = function (raw, market, isMl) {
    if (isMl) {
        return {
            symbol: raw.ticker, name: raw.name || raw.ticker, market,
            score: raw.score, ret20: raw.ret20_pct, ret120: raw.ret120_pct, rsi: raw.rsi, sector17: raw.sector17,
        };
    }
    const mkt = market || (String(raw.symbol).endsWith('.T') ? 'jp' : 'us');
    return {
        symbol: raw.symbol, name: raw.name || raw.symbol, market: mkt,
        price: raw.current_price != null ? raw.current_price : raw.price,
        change: raw.period_change != null ? raw.period_change : raw.change_percent,
        volume: raw.period_volume != null ? raw.period_volume : raw.volume,
        market_cap: raw.market_cap,
        per: raw.pe_ratio != null ? raw.pe_ratio : raw.forward_pe,
        pbr: raw.pb_ratio != null ? raw.pb_ratio : raw.pbr,
        psr: raw.psr,
        divyield: raw.dividend_yield,
        roe: raw.return_on_equity != null ? raw.return_on_equity : raw.roe,
        roa: raw.return_on_assets != null ? raw.return_on_assets : raw.roa,
        net_margin: raw.net_margin,
        dev25: raw.deviation_25,
        year_position: raw.year_position,
        trading_value: raw.trading_value,
        volume_ratio: raw.volume_ratio,
        up_streak: raw.up_streak, surge_streak: raw.surge_streak,
        revenue: raw.revenue != null ? raw.revenue : raw.total_revenue,
        net_income: raw.net_income, rsi: raw.rsi,
        alpha: raw.alpha,
    };
};

// 選択中の種別×市場×期間 の正規化済み・ソート済み全件を返す（件数非依存）
Dashboard.prototype._rkResolveRows = function (entry, market, period) {
    const isMl = entry.source === 'ml';
    let rows = [];
    const collect = (m) => this._rkRawArr(entry, m, period).map(r => this._rkNormalize(r, m, isMl));
    if (market === 'all') {
        rows = collect('jp');
        if ((entry.markets || []).includes('us')) rows = rows.concat(collect('us'));
    } else {
        rows = collect(market);
    }
    const key = entry.sortKey, dir = entry.dir;
    rows.sort((a, b) => {
        let av = a[key], bv = b[key];
        av = (av == null || isNaN(Number(av))) ? (dir === 'asc' ? Infinity : -Infinity) : Number(av);
        bv = (bv == null || isNaN(Number(bv))) ? (dir === 'asc' ? Infinity : -Infinity) : Number(bv);
        return dir === 'asc' ? av - bv : bv - av;
    });
    return rows;
};

Dashboard.prototype._rkEntry = function (id) { return RK_CATALOG.find(e => e.id === id); };

// 現在の市場で表示可能な種別一覧（graceful）
Dashboard.prototype._rkVisibleEntries = function () {
    const m = this.rk.market;
    return RK_CATALOG.filter(e => {
        const av = this.rkAvail[e.id];
        if (m === 'all') return av && av.size > 0;
        return av && av.has(m);
    });
};

Dashboard.prototype._rkRenderSidebar = function () {
    const side = document.getElementById('rk-sidebar');
    const sel = document.getElementById('rk-nav-select');
    if (!side) return;
    const entries = this._rkVisibleEntries();
    // 選択中種別が現市場で不可なら先頭にフォールバック
    if (!entries.some(e => e.id === this.rk.typeId)) this.rk.typeId = entries.length ? entries[0].id : null;

    const groups = [];
    entries.forEach(e => { let g = groups.find(x => x.name === e.g); if (!g) { g = { name: e.g, items: [] }; groups.push(g); } g.items.push(e); });

    side.innerHTML = groups.map(g => `
        <div class="rk-navgroup">
            <div class="rk-navgroup-title">${RK_FMT.esc(g.name)}</div>
            ${g.items.map(e => `<button class="rk-navbtn${e.id === this.rk.typeId ? ' active' : ''}" data-rk-type="${e.id}"${e.id === this.rk.typeId ? ' aria-current="true"' : ''}>${RK_FMT.esc(e.label)}</button>`).join('')}
        </div>`).join('');

    side.querySelectorAll('[data-rk-type]').forEach(btn => {
        btn.addEventListener('click', () => { this.rk.typeId = btn.dataset.rkType; this.rk.page = 0; this._rkRenderSidebar(); this._rkRender(); });
    });

    if (sel) {
        sel.innerHTML = groups.map(g => `<optgroup label="${RK_FMT.esc(g.name)}">${g.items.map(e => `<option value="${e.id}"${e.id === this.rk.typeId ? ' selected' : ''}>${RK_FMT.esc(e.label)}</option>`).join('')}</optgroup>`).join('');
    }
};

Dashboard.prototype._rkWireControls = function () {
    document.querySelectorAll('[data-rk-market]').forEach(btn => {
        btn.addEventListener('click', () => {
            this.rk.market = btn.dataset.rkMarket; this.rk.page = 0;
            document.querySelectorAll('[data-rk-market]').forEach(b => { const on = b === btn; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
            this._rkRenderSidebar(); this._rkRender();
        });
    });
    document.querySelectorAll('[data-rk-period]').forEach(btn => {
        btn.addEventListener('click', () => {
            this.rk.period = btn.dataset.rkPeriod; this.rk.page = 0;
            document.querySelectorAll('[data-rk-period]').forEach(b => { const on = b === btn; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
            this._rkRender();
        });
    });
    const sel = document.getElementById('rk-nav-select');
    if (sel) sel.addEventListener('change', () => { this.rk.typeId = sel.value; this.rk.page = 0; this._rkRenderSidebar(); this._rkRender(); });
};

Dashboard.prototype._rkFmtUpdated = function (entry) {
    let iso = null;
    if (entry.source === 'period') {
        if (this.rk.market === 'us' && this.rkUsFull && this.rkUsFull.metadata) iso = this.rkUsFull.metadata.generated_at;
        if (!iso) { const pk = this.rk.market === 'us' ? 'us_' + this.rk.period : this.rk.period; iso = ((this.rkPer[pk] || {}).metadata || {}).generated_at; }
    }
    else if (entry.source === 'extended') { iso = (this.rk.market === 'us' ? (this.rkExtUs || {}).timestamp : null) || this.rkExt.timestamp; }
    else if (entry.source === 'ml') { const s = this.rk.market === 'us' ? this.rkMlUs : this.rkMlJp; iso = (s || {}).as_of_date || (s || {}).generated_at; }
    if (!iso) return '';
    const s = String(iso).replace('T', ' ').slice(0, 16);
    return '更新: ' + s;
};

Dashboard.prototype._rkRender = function () {
    const entry = this._rkEntry(this.rk.typeId);
    const table = document.getElementById('rk-table');
    const pager = document.getElementById('rk-pager');
    const titleEl = document.getElementById('rk-title');
    const noteEl = document.getElementById('rk-note');
    const updatedEl = document.getElementById('rk-updated');
    const mLabel = document.getElementById('rk-market-label');
    const pLabel = document.getElementById('rk-period-label');
    const periodSwitch = document.getElementById('rk-period-switch');
    if (!entry || !table) {
        if (table) table.innerHTML = '<tbody><tr><td class="rk-empty">この市場に表示できるランキングがありません。</td></tr></tbody>';
        if (pager) pager.innerHTML = '';
        return;
    }

    // ヘッダ
    if (titleEl) titleEl.textContent = entry.label + 'ランキング';
    if (mLabel) mLabel.textContent = RK_MARKET_LABELS[this.rk.market];
    // 期間タブは period 種別のみ有効。それ以外は淡色化＋注記。
    const periodBased = entry.source === 'period';
    if (periodSwitch) periodSwitch.classList.toggle('rk-dim', !periodBased);
    if (pLabel) pLabel.textContent = periodBased ? RK_PERIOD_LABELS[this.rk.period] : '期間指定なし（スナップショット）';
    if (updatedEl) updatedEl.textContent = this._rkFmtUpdated(entry);
    if (noteEl) { if (entry.note) { noteEl.textContent = entry.note; noteEl.hidden = false; } else { noteEl.hidden = true; noteEl.textContent = ''; } }

    const rows = this._rkResolveRows(entry, this.rk.market, this.rk.period);
    const total = rows.length;
    const cols = RK_CS[entry.cs].map(id => RK_COLS[id]);

    if (!total) {
        table.innerHTML = '<tbody><tr><td class="rk-empty">現在このランキングに該当する銘柄データがありません（データ未生成の可能性）。</td></tr></tbody>';
        if (pager) pager.innerHTML = '';
        return;
    }

    // ページング（件数非依存）
    const pageCount = Math.ceil(total / RK_PAGE_SIZE);
    if (this.rk.page >= pageCount) this.rk.page = pageCount - 1;
    if (this.rk.page < 0) this.rk.page = 0;
    const start = this.rk.page * RK_PAGE_SIZE;
    const pageRows = rows.slice(start, start + RK_PAGE_SIZE);

    const thead = '<thead><tr>' + RK_CS[entry.cs].map(id => `<th class="${RK_COLS[id].cls}">${RK_COLS[id].label}</th>`).join('') + '</tr></thead>';
    const body = '<tbody>' + pageRows.map((n, i) => {
        const rank = start + i + 1;
        const cells = RK_CS[entry.cs].map(id => {
            if (id === 'rank') return `<td class="rk-c-rank"><span class="rk-rank${rank <= 3 ? ' top' : ''}">${rank}</span></td>`;
            if (id === 'name') {
                const badge = `<span class="rk-badge rk-badge-${n.market}">${n.market === 'jp' ? '東証' : '米'}</span>`;
                return `<td class="rk-c-name"><span class="rk-code">${RK_FMT.esc(n.symbol)}</span> ${badge}<span class="rk-name-txt">${RK_FMT.esc(String(n.name).slice(0, 24))}</span></td>`;
            }
            return `<td class="${RK_COLS[id].cls}">${RK_COLS[id].r(n)}</td>`;
        }).join('');
        return `<tr class="rk-row" tabindex="0" data-sym="${RK_FMT.esc(n.symbol)}">${cells}</tr>`;
    }).join('') + '</tbody>';
    table.innerHTML = thead + body;

    // 行クリック/Enter → 銘柄詳細
    table.querySelectorAll('tr.rk-row').forEach(tr => {
        const go = () => { const s = tr.dataset.sym; if (s) window.location.href = '/stocks/detail/?s=' + encodeURIComponent(s); };
        tr.addEventListener('click', go);
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    });

    // ページ送り: 「N件中 X〜Y件」＋前/次
    if (pager) {
        const from = start + 1, to = Math.min(start + RK_PAGE_SIZE, total);
        pager.innerHTML =
            `<button class="rk-pgbtn" id="rk-prev"${this.rk.page === 0 ? ' disabled' : ''}>‹ 前のページ</button>`
            + `<span class="rk-pgstat">${total.toLocaleString('ja-JP')}件中 <strong>${from}〜${to}</strong>件（${this.rk.page + 1}/${pageCount}）</span>`
            + `<button class="rk-pgbtn" id="rk-next"${this.rk.page >= pageCount - 1 ? ' disabled' : ''}>次のページ ›</button>`;
        const prev = document.getElementById('rk-prev'), next = document.getElementById('rk-next');
        if (prev) prev.addEventListener('click', () => { if (this.rk.page > 0) { this.rk.page--; this._rkRender(); this._rkScrollTop(); } });
        if (next) next.addEventListener('click', () => { if (this.rk.page < pageCount - 1) { this.rk.page++; this._rkRender(); this._rkScrollTop(); } });
    }
};

Dashboard.prototype._rkScrollTop = function () {
    const head = document.querySelector('.rk-main-head');
    if (head && head.scrollIntoView) head.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
