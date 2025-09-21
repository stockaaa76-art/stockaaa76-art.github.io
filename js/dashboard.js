/**
 * ダッシュボード用JavaScript
 * 日経・ダウの価格表示とスパークライン
 */

class Dashboard {
    constructor() {
        this.summary_api = '/api/summary.json';
        this.indices_api = '/api/major_indices.json';
        this.realtime_api = '/data/realtime_prices.json';
        this.init();
    }

    async init() {
        console.log('Dashboard初期化開始');
        try {
            console.log('realtime APIを読み込み中...');
            await this.loadRealtimeData();
            console.log('国際指標APIを読み込み中...');
            await this.loadInternationalIndices();
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
            this.updateInternationalIndices(data);
            
        } catch (error) {
            console.error('国際指標データ取得エラー:', error);
            // 国際指標はサブ機能なので、エラーでも全体は停止しない
        }
    }

    updateIndexHeroesFromRealtime(data) {
        // 日経平均更新（realtime_prices.json形式）
        const nikkei = data.indices.find(idx => idx.ticker === '^N225');
        if (nikkei) {
            this.updateIndexCardFromRealtime('nikkei', nikkei);
        }

        // ダウ平均更新（foreign配列から取得）
        const dow = data.foreign && data.foreign.find(idx => idx.ticker === '^GSPC'); // S&P 500をダウの代替として使用
        if (dow) {
            this.updateIndexCardFromRealtime('dow', dow);
        }
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
        for (const symbol of symbols) {
            try {
                const response = await fetch(`/api/stocks/${symbol}.json`);
                if (response.ok) {
                    const data = await response.json();
                    this.updateWatchlistItem(symbol, data);
                }
            } catch (error) {
                console.error(`ウォッチリスト価格取得エラー ${symbol}:`, error);
            }
        }
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