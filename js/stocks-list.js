/**
 * 株式一覧ページ用JavaScript
 * 200銘柄のフィルタ・ソート・ページング・検索機能
 */

class StocksList {
    constructor() {
        this.stocks = [];
        this.filteredStocks = [];
        this.currentPage = 1;
        this.itemsPerPage = 50;
        this.sortBy = 'symbol';
        this.sortDirection = 'asc';
        this.filters = {
            search: '',
            market: 'all',
            tier: 'all'
        };
        
        // API endpoints
        this.stocksAPI = '/api/stocks/index.json';
        this.universeAPI = '/api/universe.json';
        
        this.init();
    }

    async init() {
        try {
            await this.loadStocksData();
            this.setupEventListeners();
            this.applyFiltersAndSort();
            this.parseURLParams();
            
            // 5分ごとに価格データ更新
            setInterval(() => {
                this.updateStockPrices();
            }, 5 * 60 * 1000);
            
        } catch (error) {
            console.error('StocksList初期化エラー:', error);
            this.showError('データの読み込みに失敗しました');
        }
    }

    async loadStocksData() {
        try {
            // 並列でstocksとuniverseデータを取得
            const [stocksRes, universeRes] = await Promise.all([
                fetch(this.stocksAPI),
                fetch(this.universeAPI).catch(() => null) // universeは任意
            ]);

            if (!stocksRes.ok) {
                throw new Error(`株価データ取得エラー: ${stocksRes.status}`);
            }

            const stocksData = await stocksRes.json();
            let universeData = null;
            
            if (universeRes && universeRes.ok) {
                universeData = await universeRes.json();
            }

            this.processStocksData(stocksData, universeData);
            this.updateStockCount();
            
        } catch (error) {
            console.error('データ読み込みエラー:', error);
            throw error;
        }
    }

    processStocksData(stocksData, universeData) {
        // universeデータがある場合はtier情報を追加
        const tierMap = new Map();
        
        if (universeData) {
            // Core銘柄
            universeData.core_universe?.forEach(stock => {
                tierMap.set(stock.ticker, 'core');
            });
            
            // Active銘柄
            universeData.active_universe?.forEach(stock => {
                tierMap.set(stock.ticker, 'active');
            });
        }

        // 株価データを処理
        this.stocks = Array.isArray(stocksData) ? stocksData : stocksData.stocks || [];
        
        this.stocks = this.stocks.map(stock => ({
            ...stock,
            tier: tierMap.get(stock.symbol) || 'other',
            market: this.detectMarket(stock.symbol),
            searchText: `${stock.symbol} ${stock.name}`.toLowerCase()
        }));

        console.log(`株価データ読み込み完了: ${this.stocks.length} 銘柄`);
    }

    detectMarket(symbol) {
        if (symbol.endsWith('.T')) return 'JP';
        if (symbol.startsWith('^') || symbol.includes('=X')) return 'INDEX';
        if (/^[A-Z]{3,4}$/.test(symbol)) return 'US';
        if (symbol.includes('ETF') || symbol.includes('SPY') || symbol.includes('QQQ')) return 'ETF';
        return 'OTHER';
    }

    setupEventListeners() {
        // 検索ボックス
        const searchInput = document.getElementById('stock-search');
        const searchClear = document.getElementById('search-clear');
        
        let searchTimeout;
        searchInput?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.filters.search = e.target.value.toLowerCase();
                this.currentPage = 1;
                this.applyFiltersAndSort();
                this.updateSearchClear();
            }, 300);
        });

        searchClear?.addEventListener('click', () => {
            searchInput.value = '';
            this.filters.search = '';
            this.currentPage = 1;
            this.applyFiltersAndSort();
            this.updateSearchClear();
        });

        // フィルタ
        const marketFilter = document.getElementById('market-filter');
        const tierFilter = document.getElementById('tier-filter');

        marketFilter?.addEventListener('change', (e) => {
            this.filters.market = e.target.value;
            this.currentPage = 1;
            this.applyFiltersAndSort();
        });

        tierFilter?.addEventListener('change', (e) => {
            this.filters.tier = e.target.value;
            this.currentPage = 1;
            this.applyFiltersAndSort();
        });

        // ソート
        const sortSelect = document.getElementById('sort-by');
        const sortToggle = document.getElementById('sort-direction');

        sortSelect?.addEventListener('change', (e) => {
            this.sortBy = e.target.value;
            this.applyFiltersAndSort();
        });

        sortToggle?.addEventListener('click', () => {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            sortToggle.textContent = this.sortDirection === 'asc' ? '↑ 昇順' : '↓ 降順';
            this.applyFiltersAndSort();
        });

        // テーブルヘッダークリックソート
        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const sortKey = th.dataset.sort;
                if (this.sortBy === sortKey) {
                    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sortBy = sortKey;
                    this.sortDirection = 'asc';
                }
                
                // UI更新
                document.getElementById('sort-by').value = this.sortBy;
                document.getElementById('sort-direction').textContent = 
                    this.sortDirection === 'asc' ? '↑ 昇順' : '↓ 降順';
                
                this.applyFiltersAndSort();
            });
        });
    }

    updateSearchClear() {
        const searchClear = document.getElementById('search-clear');
        const hasSearch = this.filters.search.length > 0;
        
        if (searchClear) {
            searchClear.classList.toggle('active', hasSearch);
        }
    }

    applyFiltersAndSort() {
        // フィルタ適用
        this.filteredStocks = this.stocks.filter(stock => {
            // 検索フィルタ
            if (this.filters.search && 
                !stock.searchText.includes(this.filters.search)) {
                return false;
            }

            // 市場フィルタ
            if (this.filters.market !== 'all' && 
                stock.market !== this.filters.market) {
                return false;
            }

            // 区分フィルタ
            if (this.filters.tier !== 'all' && 
                stock.tier !== this.filters.tier) {
                return false;
            }

            return true;
        });

        // ソート適用
        this.filteredStocks.sort((a, b) => {
            const aVal = this.getSortValue(a, this.sortBy);
            const bVal = this.getSortValue(b, this.sortBy);
            
            let result = 0;
            
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                result = aVal.localeCompare(bVal);
            } else {
                result = (aVal || 0) - (bVal || 0);
            }
            
            return this.sortDirection === 'desc' ? -result : result;
        });

        this.renderStocks();
        this.renderPagination();
        this.updateResultsSummary();
    }

    getSortValue(stock, key) {
        switch (key) {
            case 'symbol': return stock.symbol || '';
            case 'name': return stock.name || '';
            case 'market': return stock.market || '';
            case 'price': return parseFloat(stock.price) || 0;
            case 'change': return parseFloat(stock.change) || 0;
            case 'pct': return parseFloat(stock.change_pct) || 0;
            case 'volume': return parseInt(stock.volume) || 0;
            case 'confidence': return parseFloat(stock.confidence) || 0;
            default: return stock[key] || '';
        }
    }

    renderStocks() {
        const tbody = document.getElementById('stocks-tbody');
        if (!tbody) return;

        const start = (this.currentPage - 1) * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        const pageStocks = this.filteredStocks.slice(start, end);

        if (pageStocks.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="loading-cell">
                        ${this.filteredStocks.length === 0 ? '該当する銘柄が見つかりません' : 'データがありません'}
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = pageStocks.map(stock => `
            <tr class="stock-row" data-symbol="${stock.symbol}">
                <td class="stock-symbol">${stock.symbol}</td>
                <td class="stock-name">${this.escapeHtml(stock.name || stock.symbol)}</td>
                <td>
                    <span class="market-badge ${stock.market}">${this.getMarketLabel(stock.market)}</span>
                </td>
                <td class="number">${this.formatPrice(stock.price, stock.market)}</td>
                <td class="number price-change ${this.getChangeClass(stock.change)}">
                    ${this.formatChange(stock.change)}
                </td>
                <td class="number price-change ${this.getChangeClass(stock.change)}">
                    ${this.formatPercent(stock.change_pct)}
                </td>
                <td class="number">${this.formatVolume(stock.volume)}</td>
                <td class="tier-col">
                    <span class="tier-badge ${stock.tier}">${this.getTierLabel(stock.tier)}</span>
                </td>
                <td>
                    <div class="action-buttons">
                        <a href="/stocks/detail/?s=${stock.symbol}" class="btn-mini">詳細</a>
                        <button class="btn-mini btn-watchlist" onclick="toggleWatchlist('${stock.symbol}')">
                            ⭐
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        // 行クリックイベント
        tbody.querySelectorAll('.stock-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
                
                const symbol = row.dataset.symbol;
                window.location.href = `/stocks/detail/?s=${symbol}`;
            });
        });
    }

    renderPagination() {
        const container = document.getElementById('pagination-container');
        const info = document.getElementById('pagination-info');
        const controls = document.getElementById('pagination-controls');
        
        if (!container) return;

        const totalPages = Math.ceil(this.filteredStocks.length / this.itemsPerPage);
        
        if (totalPages <= 1) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'flex';

        // ページ情報
        const start = (this.currentPage - 1) * this.itemsPerPage + 1;
        const end = Math.min(this.currentPage * this.itemsPerPage, this.filteredStocks.length);
        
        if (info) {
            info.textContent = `${start}-${end} / ${this.filteredStocks.length} 件`;
        }

        // ページ制御
        if (controls) {
            let paginationHTML = '';
            
            // 前へボタン
            const prevDisabled = this.currentPage === 1 ? 'disabled' : '';
            paginationHTML += `<button class="pagination-btn" onclick="stocksList.goToPage(${this.currentPage - 1})" ${prevDisabled}>‹ 前へ</button>`;
            
            // ページ番号（最大5ページ表示）
            const startPage = Math.max(1, this.currentPage - 2);
            const endPage = Math.min(totalPages, startPage + 4);
            
            for (let i = startPage; i <= endPage; i++) {
                const activeClass = i === this.currentPage ? 'active' : '';
                paginationHTML += `<button class="pagination-btn ${activeClass}" onclick="stocksList.goToPage(${i})">${i}</button>`;
            }
            
            // 次へボタン
            const nextDisabled = this.currentPage === totalPages ? 'disabled' : '';
            paginationHTML += `<button class="pagination-btn" onclick="stocksList.goToPage(${this.currentPage + 1})" ${nextDisabled}>次へ ›</button>`;
            
            controls.innerHTML = paginationHTML;
        }
    }

    goToPage(page) {
        const totalPages = Math.ceil(this.filteredStocks.length / this.itemsPerPage);
        
        if (page < 1 || page > totalPages) return;
        
        this.currentPage = page;
        this.renderStocks();
        this.renderPagination();
        this.updateResultsSummary();
        
        // トップにスクロール
        document.querySelector('.stocks-header').scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    }

    updateResultsSummary() {
        const visibleCount = document.getElementById('visible-count');
        const totalCount = document.getElementById('total-count');
        
        if (visibleCount) visibleCount.textContent = this.filteredStocks.length;
        if (totalCount) totalCount.textContent = this.stocks.length;
    }

    updateStockCount() {
        const countEl = document.getElementById('stocks-count');
        if (countEl) {
            countEl.textContent = `${this.stocks.length} 銘柄`;
        }
        
        const updatedEl = document.getElementById('stocks-updated');
        if (updatedEl) {
            updatedEl.textContent = `最終更新: ${new Date().toLocaleString('ja-JP')} JST`;
        }
    }

    parseURLParams() {
        const params = new URLSearchParams(window.location.search);
        
        // フィルタパラメータ適用
        if (params.has('filter')) {
            const filter = params.get('filter').toLowerCase();
            // URLパラメータを正しいフィルター値にマッピング
            const filterMap = {
                'jp': 'JP',
                'us': 'US', 
                'etf': 'ETF',
                'index': 'INDEX',
                'crypto': 'CRYPTO'
            };
            const mappedFilter = filterMap[filter] || filter.toUpperCase();
            document.getElementById('market-filter').value = mappedFilter;
            this.filters.market = mappedFilter;
        }
        
        if (params.has('sort')) {
            const sort = params.get('sort');
            document.getElementById('sort-by').value = sort;
            this.sortBy = sort;
        }
        
        if (params.has('q')) {
            const query = params.get('q');
            document.getElementById('stock-search').value = query;
            this.filters.search = query.toLowerCase();
        }
        
        this.applyFiltersAndSort();
    }

    // ユーティリティメソッド
    getMarketLabel(market) {
        const labels = {
            'JP': '🇯🇵 JP',
            'US': '🇺🇸 US',
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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showError(message) {
        const tbody = document.getElementById('stocks-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="loading-cell" style="color: var(--error-color);">
                        ❌ ${message}
                    </td>
                </tr>
            `;
        }
    }

    async updateStockPrices() {
        try {
            const response = await fetch(this.stocksAPI + '?t=' + Date.now());
            if (response.ok) {
                const data = await response.json();
                this.processStocksData(data, null);
                this.applyFiltersAndSort();
                console.log('株価データ更新完了');
            }
        } catch (error) {
            console.error('株価更新エラー:', error);
        }
    }
}

// ウォッチリスト管理
function toggleWatchlist(symbol) {
    try {
        let watchlist = JSON.parse(localStorage.getItem('stock_watchlist') || '[]');
        
        if (watchlist.includes(symbol)) {
            watchlist = watchlist.filter(s => s !== symbol);
        } else {
            watchlist.push(symbol);
        }
        
        localStorage.setItem('stock_watchlist', JSON.stringify(watchlist));
        
        // ボタン表示更新
        const button = document.querySelector(`button[onclick="toggleWatchlist('${symbol}')"]`);
        if (button) {
            button.classList.toggle('active', watchlist.includes(symbol));
        }
        
    } catch (error) {
        console.error('ウォッチリスト更新エラー:', error);
    }
}

// グローバルインスタンス
let stocksList;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    stocksList = new StocksList();
});