/**
 * ダッシュボード用JavaScript
 * 日経・ダウの価格表示とスパークライン
 */

class Dashboard {
    constructor() {
        this.summary_api = '/api/summary.json';
        this.indices_api = '/api/major_indices.json';
        this.realtime_api = '/data/realtime_prices.json';
        this.rankings_api = '/api/rankings.json';
        this.extended_rankings_api = '/api/extended_rankings.json';
        this.enhanced_rankings_api = '/api/enhanced_rankings.json';
        this.period_rankings_api = '/api/period_rankings.json';
        this.currentRankingCategory = 'basic';
        this.currentPeriod = 'daily';
        this.init();
    }

    async init() {
        console.log('Dashboard初期化開始');
        try {
            console.log('realtime APIを読み込み中...');
            await this.loadRealtimeData();
            console.log('国際指標APIを読み込み中...');
            await this.loadInternationalIndices();
            console.log('ランキングAPIを読み込み中...');
            await this.loadRankings();
            console.log('拡張ランキングAPIを読み込み中...');
            await this.loadExtendedRankings();
            console.log('期間別ランキングAPIを読み込み中...');
            await this.loadPeriodRankings();
            console.log('拡張ランキング（強化版）を読み込み中...');
            await this.loadEnhancedRankings();
            this.setupEventListeners();
            
            // 初期描画後に再描画（Grid Layoutの初期化問題対策）
            setTimeout(() => {
                console.log('Canvas再描画実行');
                this.redrawAllCharts();
            }, 100);
            
            // 5分ごとに更新
            setInterval(() => {
                this.loadRealtimeData();
                this.loadInternationalIndices();
                this.loadRankings();
                this.loadExtendedRankings();
                this.loadPeriodRankings();
                this.loadEnhancedRankings();
            }, 5 * 60 * 1000);
            
        } catch (error) {
            console.error('Dashboard初期化エラー:', error);
            this.showError();
        }
    }

    async loadRealtimeData() {
        try {
            console.log('realtime API取得開始:', this.realtime_api);
            const response = await fetch(this.realtime_api);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log('realtime データ取得成功:', data);
            this.lastRealtimeData = data; // データを保存（再描画用）
            this.updateIndexHeroesFromRealtime(data);
            this.updateLastUpdated(data.timestamp);
            
        } catch (error) {
            console.error('リアルタイムデータ取得エラー:', error);
            // フォールバック: summary.jsonを試す
            await this.loadSummaryDataFallback();
        }
    }

    async loadSummaryDataFallback() {
        try {
            console.log('summary API取得開始 (フォールバック):', this.summary_api);
            const response = await fetch(this.summary_api);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log('summary データ取得成功:', data);
            this.lastSummaryData = data; // データを保存（再描画用）
            this.updateIndexHeroes(data);
            this.updateLastUpdated(data.updatedAt);
            
        } catch (error) {
            console.error('サマリーデータ取得エラー:', error);
            this.showError();
        }
    }

    async loadInternationalIndices() {
        try {
            const response = await fetch(this.indices_api);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            this.lastIndicesData = data; // データを保存
            this.updateInternationalIndices(data);
            
        } catch (error) {
            console.error('国際指標データ取得エラー:', error);
            // 国際指標はサブ機能なので、エラーでも全体は停止しない
        }
    }

    updateIndexHeroesFromRealtime(data) {
        // データ構造確認とフォールバック処理
        const indices = data.indices || [];
        const foreign = data.foreign || [];
        
        // 日経平均更新（realtime_prices.json形式）
        const nikkei = indices.find(idx => idx.ticker === '^N225');
        if (nikkei) {
            this.updateIndexCardFromRealtime('nikkei', nikkei);
        }

        // S&P500をダウの代替として使用（foreign配列から取得）
        const sp500 = foreign.find(idx => idx.ticker === '^GSPC'); 
        if (sp500) {
            this.updateIndexCardFromRealtime('dow', sp500);
        }
        
        console.log('メイン指標更新完了:', { nikkei: !!nikkei, sp500: !!sp500 });
    }

    updateIndexHeroes(data) {
        // 日経平均更新
        const nikkei = data.indices.find(idx => idx.symbol === 'NIKKEI225' || idx.symbol === '^N225');
        if (nikkei) {
            this.updateIndexCard('nikkei', nikkei);
        }

        // ダウ平均更新
        const dow = data.indices.find(idx => idx.symbol === 'DJI' || idx.symbol === '^DJI');
        if (dow) {
            this.updateIndexCard('dow', dow);
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
            }
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
    
    // すべてのチャートを再描画
    redrawAllCharts() {
        // リアルタイムデータを優先、フォールバック用にサマリーデータも確認
        if (this.lastRealtimeData) {
            console.log('リアルタイムデータで再描画');
            this.updateIndexHeroesFromRealtime(this.lastRealtimeData);
        } else if (this.lastSummaryData) {
            console.log('サマリーデータで再描画');
            this.updateIndexHeroes(this.lastSummaryData);
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
        // 既存のデータソースから価格情報を取得
        for (const symbol of symbols) {
            try {
                let stockData = null;
                
                // 1. rankings.jsonから検索
                if (this.lastRankingsData) {
                    stockData = this.findStockInRankings(symbol, this.lastRankingsData);
                }
                
                // 2. major_indices.jsonから検索
                if (!stockData && this.lastIndicesData) {
                    stockData = this.findStockInIndices(symbol, this.lastIndicesData);
                }
                
                // 3. realtime_prices.jsonから検索
                if (!stockData && this.lastRealtimeData) {
                    stockData = this.findStockInRealtime(symbol, this.lastRealtimeData);
                }
                
                if (stockData) {
                    this.updateWatchlistItem(symbol, stockData);
                } else {
                    // データが見つからない場合はエラー表示
                    this.updateWatchlistItemError(symbol);
                }
            } catch (error) {
                console.error(`ウォッチリスト価格取得エラー ${symbol}:`, error);
                this.updateWatchlistItemError(symbol);
            }
        }
    }
    
    findStockInRankings(symbol, data) {
        const allStocks = [
            ...(data.gainers || []),
            ...(data.losers || []),
            ...(data.volume || []),
            ...(data.market_cap || [])
        ];
        return allStocks.find(stock => stock.symbol === symbol);
    }
    
    findStockInIndices(symbol, data) {
        if (data.indices) {
            const index = data.indices.find(idx => idx.symbol === symbol);
            if (index) {
                return {
                    symbol: index.symbol,
                    name: index.name,
                    price: index.price,
                    change: index.change,
                    change_percent: index.pct,
                    market: 'INDEX'
                };
            }
        }
        return null;
    }
    
    findStockInRealtime(symbol, data) {
        if (data.stocks) {
            return data.stocks.find(stock => stock.symbol === symbol);
        }
        return null;
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
        // 値上がりランキング
        this.renderRanking('gainers-ranking', data.gainers, 'percentage');
        
        // 値下がりランキング
        this.renderRanking('losers-ranking', data.losers, 'percentage');
        
        // 出来高ランキング
        this.renderRanking('volume-ranking', data.volume, 'volume');
        
        // 時価総額ランキング
        this.renderRanking('market-cap-ranking', data.market_cap, 'market_cap');
    }

    renderRanking(elementId, stocks, type) {
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
                    valueText = this.formatPrice(stock.price, '¥');
                    changeText = this.formatPercent(stock.change_percent);
                    break;
                case 'volume':
                    valueText = this.formatVolume(stock.volume);
                    changeText = this.formatPercent(stock.change_percent);
                    break;
                case 'market_cap':
                    valueText = this.formatMarketCap(stock.market_cap);
                    changeText = this.formatPercent(stock.change_percent);
                    break;
            }

            // 変化率の色分け
            if (stock.change_percent > 0) {
                changeClass = 'positive';
            } else if (stock.change_percent < 0) {
                changeClass = 'negative';
            }

            return `
                <div class="ranking-item">
                    <div class="ranking-item-left">
                        <span class="ranking-symbol">${rank}. ${stock.symbol}</span>
                        <span class="ranking-name">${stock.name}</span>
                    </div>
                    <div class="ranking-item-right">
                        <div class="ranking-values">
                            <span class="ranking-value">${valueText}</span>
                            <span class="ranking-change ${changeClass}">${changeText}</span>
                        </div>
                        <button class="btn-star" data-symbol="${stock.symbol}" onclick="toggleWatchlist('${stock.symbol}')" title="ウォッチリストに追加">⭐</button>
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
                const category = e.target.dataset.category;
                this.switchRankingCategory(category);
            });
        });
    }
    
    switchRankingCategory(category) {
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
                <div class="ranking-item">
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
            'golden-cross-ranking', 'dead-cross-ranking'
        ];
        
        extendedRankingContainers.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.innerHTML = '<div class="loading">データ取得エラー</div>';
            }
        });
    }

    formatVolume(volume) {
        if (volume >= 1000000) {
            return (volume / 1000000).toFixed(1) + 'M株';
        } else if (volume >= 1000) {
            return (volume / 1000).toFixed(1) + 'K株';
        }
        return volume.toLocaleString() + '株';
    }

    formatMarketCap(marketCap) {
        if (marketCap >= 1000000000000) {
            return (marketCap / 1000000000000).toFixed(1) + '兆円';
        } else if (marketCap >= 100000000) {
            return (marketCap / 100000000).toFixed(1) + '億円';
        } else if (marketCap >= 10000) {
            return (marketCap / 10000).toFixed(1) + '万円';
        }
        return marketCap.toLocaleString() + '円';
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
    new Dashboard();
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
        
    } catch (error) {
        console.error('期間別ランキング取得エラー:', error);
    }
};

Dashboard.prototype.updatePeriodRankings = function() {
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
        const formattedVolume = this.formatVolume(item.volume);
        const formattedMarketCap = this.formatMarketCap(item.market_cap);
        
        let valueDisplay = '';
        if (elementId.includes('volume')) {
            valueDisplay = formattedVolume;
        } else if (elementId.includes('market-cap')) {
            valueDisplay = formattedMarketCap;
        } else {
            valueDisplay = formattedPrice;
        }
        
        return `
            <div class="ranking-item" onclick="window.open('/stocks/detail/?s=${encodeURIComponent(item.symbol)}', '_blank')">
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
    this.currentPeriod = period;
    
    // アクティブな期間タブを更新
    document.querySelectorAll('.period-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-period="${period}"]`).classList.add('active');
    
    // ランキングを更新
    this.updatePeriodRankings();
};

Dashboard.prototype.setupPeriodTabs = function() {
    // 期間タブのイベントリスナー設定
    const periodButtons = document.querySelectorAll('.period-button');
    
    periodButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const period = e.target.dataset.period;
            this.switchPeriod(period);
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
            <div class="ranking-item" onclick="window.open('/stocks/detail/?s=${encodeURIComponent(item.symbol)}', '_blank')">
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