/**
 * 株価チャート表示システム
 * Chart.jsを使用したインタラクティブな株価チャート
 */

class StockChartManager {
    constructor() {
        this.charts = new Map();
        this.chartData = null;
        this.currentTheme = this.detectTheme();
        
        this.initializeCharts();
    }

    /**
     * テーマを検出（ダークモード対応）
     */
    detectTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    /**
     * チャート初期化
     */
    async initializeCharts() {
        try {
            // チャートデータを読み込み
            const response = await fetch('/data/chart_data.json');
            if (!response.ok) {
                throw new Error('チャートデータの読み込みに失敗しました');
            }
            
            this.chartData = await response.json();
            console.log('チャートデータ読み込み完了:', Object.keys(this.chartData.charts).length, '銘柄');
            
            // 各チャートを生成
            this.createAllCharts();
            
        } catch (error) {
            console.error('チャートデータの読み込みエラー:', error);
            this.showChartError();
        }
    }

    /**
     * 全チャートを生成
     */
    createAllCharts() {
        document.querySelectorAll('.chart-container').forEach(container => {
            const ticker = container.dataset.ticker;
            if (ticker && this.chartData.charts[ticker]) {
                this.createChart(container, ticker);
            }
        });
    }

    /**
     * 個別チャートを生成
     */
    createChart(container, ticker) {
        const chartData = this.chartData.charts[ticker];
        
        // キャンバス要素を作成
        const canvas = document.createElement('canvas');
        canvas.id = `chart-${ticker.replace(/[^a-zA-Z0-9]/g, '_')}`;
        canvas.style.maxHeight = '200px';
        
        // 既存の内容をクリア
        container.innerHTML = '';
        container.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        
        // Chart.jsの設定
        const config = {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [
                    {
                        ...chartData.datasets[0],
                        pointRadius: 2,
                        pointHoverRadius: 5,
                        pointBackgroundColor: this.getThemeColors().primary,
                        pointBorderColor: this.getThemeColors().primary,
                        borderColor: this.getThemeColors().primary,
                        backgroundColor: this.getThemeColors().primaryAlpha
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `${chartData.name} - 過去30日`,
                        color: this.getThemeColors().text,
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: this.getThemeColors().tooltipBg,
                        titleColor: this.getThemeColors().text,
                        bodyColor: this.getThemeColors().text,
                        borderColor: this.getThemeColors().border,
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed.y;
                                return `終値: ¥${value.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: '日付',
                            color: this.getThemeColors().text
                        },
                        ticks: {
                            color: this.getThemeColors().text,
                            maxTicksLimit: 7,
                            callback: function(value, index) {
                                const label = this.getLabelForValue(value);
                                // MM/DD形式で表示
                                const date = new Date(label);
                                return `${date.getMonth() + 1}/${date.getDate()}`;
                            }
                        },
                        grid: {
                            color: this.getThemeColors().gridLines
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: '価格 (¥)',
                            color: this.getThemeColors().text
                        },
                        ticks: {
                            color: this.getThemeColors().text,
                            callback: function(value) {
                                return '¥' + value.toLocaleString();
                            }
                        },
                        grid: {
                            color: this.getThemeColors().gridLines
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                animation: {
                    duration: 1000,
                    easing: 'easeInOutQuart'
                }
            }
        };

        // チャートを作成
        const chart = new Chart(ctx, config);
        this.charts.set(ticker, chart);
        
        console.log(`チャート作成完了: ${ticker} (${chartData.name})`);
    }

    /**
     * テーマに応じた色設定を取得
     */
    getThemeColors() {
        if (this.currentTheme === 'dark') {
            return {
                primary: 'rgb(59, 130, 246)',
                primaryAlpha: 'rgba(59, 130, 246, 0.1)',
                text: '#d1d5db',
                tooltipBg: 'rgba(31, 41, 55, 0.9)',
                border: '#374151',
                gridLines: 'rgba(107, 114, 128, 0.3)'
            };
        } else {
            return {
                primary: 'rgb(59, 130, 246)',
                primaryAlpha: 'rgba(59, 130, 246, 0.1)',
                text: '#374151',
                tooltipBg: 'rgba(255, 255, 255, 0.95)',
                border: '#e5e7eb',
                gridLines: 'rgba(107, 114, 128, 0.2)'
            };
        }
    }

    /**
     * チャートエラー表示
     */
    showChartError() {
        document.querySelectorAll('.chart-container').forEach(container => {
            container.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 200px; color: #6b7280; font-size: 14px;">
                    ⚠️ チャートデータの読み込みに失敗しました
                </div>
            `;
        });
    }

    /**
     * テーマ変更時の再描画
     */
    updateTheme(newTheme) {
        this.currentTheme = newTheme;
        
        // 全チャートを更新
        this.charts.forEach((chart, ticker) => {
            const colors = this.getThemeColors();
            
            // データセットの色を更新
            chart.data.datasets[0].borderColor = colors.primary;
            chart.data.datasets[0].backgroundColor = colors.primaryAlpha;
            chart.data.datasets[0].pointBackgroundColor = colors.primary;
            chart.data.datasets[0].pointBorderColor = colors.primary;
            
            // スケールの色を更新
            chart.options.plugins.title.color = colors.text;
            chart.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
            chart.options.plugins.tooltip.titleColor = colors.text;
            chart.options.plugins.tooltip.bodyColor = colors.text;
            chart.options.plugins.tooltip.borderColor = colors.border;
            chart.options.scales.x.title.color = colors.text;
            chart.options.scales.x.ticks.color = colors.text;
            chart.options.scales.x.grid.color = colors.gridLines;
            chart.options.scales.y.title.color = colors.text;
            chart.options.scales.y.ticks.color = colors.text;
            chart.options.scales.y.grid.color = colors.gridLines;
            
            chart.update();
        });
    }

    /**
     * 特定のチャートを更新
     */
    updateChart(ticker, newData) {
        const chart = this.charts.get(ticker);
        if (chart && newData) {
            chart.data.labels = newData.labels;
            chart.data.datasets[0].data = newData.datasets[0].data;
            chart.update();
        }
    }

    /**
     * 全チャートを破棄
     */
    destroyAllCharts() {
        this.charts.forEach(chart => chart.destroy());
        this.charts.clear();
    }
}

// グローバル変数として初期化
let stockChartManager;

// DOM読み込み完了後に初期化
document.addEventListener('DOMContentLoaded', function() {
    stockChartManager = new StockChartManager();
    
    // ダークモード変更の監視
    if (window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addListener(function(e) {
            const newTheme = e.matches ? 'dark' : 'light';
            stockChartManager.updateTheme(newTheme);
        });
    }
});

// ページ離脱時にチャートを破棄
window.addEventListener('beforeunload', function() {
    if (stockChartManager) {
        stockChartManager.destroyAllCharts();
    }
});