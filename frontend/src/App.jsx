import React, { useState, useRef, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

function App() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fixedCosts, setFixedCosts] = useState('');
  const [activeTab, setActiveTab] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [backendStatus, setBackendStatus] = useState('checking');
  const [aiStatus, setAiStatus] = useState('checking');
  const fileRef = useRef();

  // ─── Health Check on Mount ───────────────────────────────────────────────
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_URL}/api/health`);
        const data = await res.json();
        setBackendStatus(data.status === 'healthy' ? 'connected' : 'error');
        setAiStatus(data.ai ? 'live' : 'offline');
      } catch {
        setBackendStatus('offline');
        setAiStatus('offline');
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 60000); // re-check every 60s
    return () => clearInterval(interval);
  }, []);

  // ─── CSV Upload ──────────────────────────────────────────────────────
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    await analyze(text);
  };

  const analyze = async (csvText) => {
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv: csvText,
          fixed_costs: parseFloat(fixedCosts) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setResults(data);
      setActiveTab('report');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Sample Data ─────────────────────────────────────────────────────
  const loadSample = () => {
    const csv = `date,item,category,price,cost,quantity
2026-01-01,Flat White,Coffee,5.50,1.20,45
2026-01-01,Cappuccino,Coffee,5.50,1.20,38
2026-01-01,Long Black,Coffee,4.50,0.90,30
2026-01-01,Croissant,Pastry,5.00,1.50,25
2026-01-01,Banana Bread,Pastry,6.00,1.80,18
2026-01-01,Avocado Toast,Food,16.00,5.50,22
2026-01-01,Eggs Benedict,Food,19.00,6.00,15
2026-01-01,Smoothie,Drinks,9.00,3.00,20
2026-01-01,Iced Latte,Coffee,6.00,1.40,28
2026-01-01,Chai Latte,Coffee,5.50,1.30,15
2026-01-02,Flat White,Coffee,5.50,1.20,50
2026-01-02,Cappuccino,Coffee,5.50,1.20,42
2026-01-02,Long Black,Coffee,4.50,0.90,35
2026-01-02,Croissant,Pastry,5.00,1.50,30
2026-01-02,Banana Bread,Pastry,6.00,1.80,20
2026-01-02,Avocado Toast,Food,16.00,5.50,25
2026-01-02,Eggs Benedict,Food,19.00,6.00,18
2026-01-02,Smoothie,Drinks,9.00,3.00,22
2026-01-02,Iced Latte,Coffee,6.00,1.40,32
2026-01-02,Chai Latte,Coffee,5.50,1.30,18
2026-01-03,Flat White,Coffee,5.50,1.20,42
2026-01-03,Cappuccino,Coffee,5.50,1.20,36
2026-01-03,Long Black,Coffee,4.50,0.90,28
2026-01-03,Croissant,Pastry,5.00,1.50,22
2026-01-03,Banana Bread,Pastry,6.00,1.80,15
2026-01-03,Avocado Toast,Food,16.00,5.50,20
2026-01-03,Eggs Benedict,Food,19.00,6.00,12
2026-01-03,Smoothie,Drinks,9.00,3.00,18
2026-01-03,Iced Latte,Coffee,6.00,1.40,25
2026-01-03,Chai Latte,Coffee,5.50,1.30,12`;
    setFixedCosts('3500');
    setFileName('sample_cafe_data.csv');
    analyze(csv);
  };

  const s = results?.metrics?.summary;

  const POS_LABELS = {
    square: 'Square POS',
    lightspeed: 'Lightspeed POS',
    toast: 'Toast POS',
    clover: 'Clover POS',
    shopify: 'Shopify POS',
    generic: 'Custom CSV',
  };

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Nav */}
      <nav className="border-b border-dark-600/50 backdrop-blur-xl bg-white/90 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">☕</span>
            <span className="text-lg font-bold tracking-tight text-xero-dark">AI Cafe Analyst</span>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge label="Backend" status={backendStatus} />
            <StatusBadge label="AI" status={aiStatus} />
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-3 text-xero-dark">
            Your cafe's finances,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-xero-blue to-xero-teal">
              analyzed by AI.
            </span>
          </h1>
          <p className="text-gray-500 text-base sm:text-lg max-w-xl">
            Upload your sales data from any POS system. Get instant P&L analysis, margin breakdowns, and AI-powered recommendations to boost profit.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {['Square', 'Lightspeed', 'Toast', 'Clover', 'Shopify', 'Custom CSV'].map((pos) => (
              <span key={pos} className="text-[11px] bg-white text-gray-500 px-2.5 py-1 rounded-lg border border-dark-600/50 shadow-sm">
                {pos}
              </span>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-dark-700 rounded-xl p-1 w-fit">
          {['upload', 'report', 'ai'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              disabled={tab !== 'upload' && !results}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                activeTab === tab
                  ? 'bg-white text-xero-dark shadow-sm'
                  : 'text-gray-500 hover:text-xero-dark disabled:opacity-30 disabled:cursor-not-allowed'
              }`}
            >
              {tab === 'ai' ? 'AI Insights' : tab}
            </button>
          ))}
        </div>

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="bg-white border border-dark-600/50 rounded-2xl p-6 md:p-8 shadow-sm">
            <h2 className="text-xl font-semibold mb-2 text-xero-dark">Upload Cafe Data</h2>
            <p className="text-sm text-gray-500 mb-6">Export a CSV from your POS system and upload it here. We auto-detect the format.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm text-gray-500 mb-2">Monthly Fixed Costs (rent, salaries, utilities)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                  <input
                    type="number" min="0" value={fixedCosts}
                    onChange={(e) => setFixedCosts(e.target.value)}
                    placeholder="e.g. 3500"
                    className="w-full bg-dark-700 border border-dark-600 rounded-xl pl-8 pr-4 py-3 text-xero-dark focus:outline-none focus:border-xero-blue/50 focus:ring-1 focus:ring-xero-blue/20 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-2">Sales CSV File</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFile}
                  className="hidden"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full bg-dark-700 border border-dashed border-dark-600 rounded-xl py-3 px-4 text-gray-500 hover:border-xero-blue/50 hover:text-xero-dark transition-all text-left"
                >
                  {fileName || '📁 Choose CSV file...'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-5">
              <button
                onClick={loadSample}
                className="bg-xero-blue hover:bg-xero-teal text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-sm"
              >
                ▶ Try with Sample Data
              </button>
            </div>

            {/* POS Export Guide */}
            <div className="bg-dark-700/60 border border-dark-600/40 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">📋 How to export from your POS:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-gray-500">
                <span><strong className="text-gray-600">Square:</strong> Reports → Sales → Export CSV (Items Detail)</span>
                <span><strong className="text-gray-600">Lightspeed:</strong> Reports → Sales → Export to CSV</span>
                <span><strong className="text-gray-600">Toast:</strong> Reports → Sales Summary → Download CSV</span>
                <span><strong className="text-gray-600">Clover:</strong> Sales → Transactions → Export</span>
                <span><strong className="text-gray-600">Shopify:</strong> Analytics → Reports → Export CSV</span>
                <span><strong className="text-gray-600">Other:</strong> Any CSV with item, sales, quantity columns</span>
              </div>
            </div>

            {loading && (
              <div className="mt-6 flex items-center gap-3 text-xero-blue">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Analyzing your data...
              </div>
            )}

            {error && (
              <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4 text-loss text-sm">{error}</div>
            )}
          </div>
        )}

        {/* Report Tab */}
        {activeTab === 'report' && results && (
          <div className="space-y-6">
            {/* Detected Format Banner */}
            {results.pos_format_detected && (
              <div className="flex items-center gap-2 bg-white border border-dark-600/40 rounded-xl px-4 py-2.5 shadow-sm">
                <span className="text-sm">🔌</span>
                <span className="text-sm text-gray-600">
                  Detected: <strong className="text-xero-dark">{POS_LABELS[results.pos_format_detected] || results.pos_format_detected}</strong>
                </span>
                <span className="text-xs text-gray-400 ml-auto">{results.rows_processed} rows processed</span>
                {!results.metrics.summary.total_cogs && (
                  <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-md border border-amber-200">
                    Tip: Add cost data for margin analysis
                  </span>
                )}
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPI label="Revenue" value={`$${s.total_revenue.toLocaleString()}`} />
              <KPI label="Gross Profit" value={`$${s.gross_profit.toLocaleString()}`} sub={`${s.gross_margin_pct}% margin`} color={s.gross_margin_pct >= 65 ? 'gain' : s.gross_margin_pct >= 50 ? 'accent' : 'loss'} />
              <KPI label="Net Profit" value={`$${s.net_profit.toLocaleString()}`} sub={`${s.net_margin_pct}% margin`} color={s.net_profit >= 0 ? 'gain' : 'loss'} />
              <KPI label="Food Cost" value={`${s.food_cost_pct}%`} sub="Target: 28-32%" color={s.food_cost_pct <= 32 ? 'gain' : s.food_cost_pct <= 38 ? 'accent' : 'loss'} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPI label="Avg Order Value" value={`$${s.avg_order_value}`} />
              <KPI label="Units Sold" value={s.total_units_sold.toLocaleString()} />
              <KPI label="Break-Even" value={`${s.break_even_units} units`} sub="to cover fixed costs" />
              <KPI label="Daily Revenue" value={`$${s.avg_daily_revenue}`} sub={`${s.avg_daily_transactions} orders/day`} />
            </div>

            {/* P&L Statement */}
            <div className="bg-white border border-dark-600/50 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4 text-xero-dark">Profit & Loss Summary</h3>
              <div className="space-y-2 text-sm">
                <PLRow label="Total Revenue" value={s.total_revenue} bold />
                <PLRow label="Cost of Goods Sold" value={-s.total_cogs} negative />
                <div className="border-t border-dark-600/50 my-2"></div>
                <PLRow label="Gross Profit" value={s.gross_profit} bold color={s.gross_profit >= 0 ? 'gain' : 'loss'} />
                <PLRow label="Fixed Costs" value={-s.fixed_costs} negative />
                <div className="border-t border-dark-600/50 my-2"></div>
                <PLRow label="Net Profit" value={s.net_profit} bold color={s.net_profit >= 0 ? 'gain' : 'loss'} />
              </div>
            </div>

            {/* Top Items */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-dark-600/50 rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 text-xero-dark">🏆 Top Items by Profit</h3>
                <div className="space-y-3">
                  {results.metrics.top_items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between bg-dark-700/60 rounded-xl px-4 py-3">
                      <div>
                        <span className="text-sm font-medium text-xero-dark">{item.name}</span>
                        <span className="text-xs text-gray-400 ml-2">{item.quantity} sold</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-gain">${item.profit}</span>
                        <span className="text-xs text-gray-400 ml-2">profit</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-dark-600/50 rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 text-xero-dark">⚠️ Lowest Performers</h3>
                <div className="space-y-3">
                  {results.metrics.worst_items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between bg-dark-700/60 rounded-xl px-4 py-3">
                      <div>
                        <span className="text-sm font-medium text-xero-dark">{item.name}</span>
                        <span className="text-xs text-gray-400 ml-2">{item.quantity} sold</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-bold ${item.profit >= 0 ? 'text-amber-500' : 'text-loss'}`}>${item.profit}</span>
                        <span className="text-xs text-gray-400 ml-2">profit</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Category Breakdown */}
            {Object.keys(results.metrics.categories).length > 0 && (
              <div className="bg-white border border-dark-600/50 rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 text-xero-dark">📊 Category Breakdown</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 text-xs uppercase tracking-wider">
                        <th className="text-left pb-3">Category</th>
                        <th className="text-right pb-3">Revenue</th>
                        <th className="text-right pb-3">Cost</th>
                        <th className="text-right pb-3">Profit</th>
                        <th className="text-right pb-3">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(results.metrics.categories).map(([cat, d]) => (
                        <tr key={cat} className="border-t border-dark-600/40">
                          <td className="py-3 font-medium text-xero-dark">{cat}</td>
                          <td className="py-3 text-right text-xero-dark">${d.revenue}</td>
                          <td className="py-3 text-right text-gray-500">${d.cost}</td>
                          <td className={`py-3 text-right font-semibold ${d.profit >= 0 ? 'text-gain' : 'text-loss'}`}>${d.profit}</td>
                          <td className="py-3 text-right text-xero-dark">{d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Insights Tab */}
        {activeTab === 'ai' && results && (
          <div className="bg-white border border-dark-600/50 rounded-2xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">🤖</span>
              <div>
                <h2 className="text-xl font-semibold text-xero-dark">AI Financial Recommendations</h2>
                <p className="text-xs text-gray-400">
                  {results.ai_enabled ? 'Powered by Llama 3.3 70B via Groq' : 'AI not configured — set GROQ_API_KEY'}
                </p>
              </div>
            </div>
            <div className="prose max-w-none whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
              {results.ai_recommendations}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <span>Analyzed {results.rows_processed} rows · {results.analyzed_at}</span>
              {results.pos_format_detected && (
                <span className="bg-dark-700 text-gray-500 px-2 py-0.5 rounded-md">
                  Format: {POS_LABELS[results.pos_format_detected] || results.pos_format_detected}
                </span>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-600/40 mt-16">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <span>☕</span> AI Cafe Analyst · Free & Open Source
          </div>
          <div className="text-xs text-gray-400">
            AI by Groq (free) · Deployed on Vercel (free)
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function KPI({ label, value, sub, color }) {
  const colors = { gain: 'text-gain', loss: 'text-loss', accent: 'text-xero-blue' };
  return (
    <div className="bg-white border border-dark-600/50 rounded-2xl p-5 shadow-sm">
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color] || 'text-xero-dark'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function PLRow({ label, value, bold, negative, color }) {
  const colors = { gain: 'text-gain', loss: 'text-loss' };
  return (
    <div className="flex justify-between items-center">
      <span className={bold ? 'font-semibold text-xero-dark' : 'text-gray-500'}>{label}</span>
      <span className={`${bold ? 'font-bold text-lg' : ''} ${colors[color] || (negative ? 'text-gray-500' : 'text-xero-dark')}`}>
        {negative ? `(${Math.abs(value).toLocaleString()})` : `$${value.toLocaleString()}`}
      </span>
    </div>
  );
}

function StatusBadge({ label, status }) {
  const config = {
    connected: { color: 'bg-gain', text: 'Connected', pulse: false },
    live:      { color: 'bg-gain', text: 'Live', pulse: true },
    checking:  { color: 'bg-amber-400', text: 'Checking...', pulse: true },
    offline:   { color: 'bg-loss', text: 'Offline', pulse: false },
    error:     { color: 'bg-loss', text: 'Error', pulse: false },
  };
  const c = config[status] || config.checking;
  return (
    <div className="flex items-center gap-1.5 bg-dark-700/80 rounded-lg px-2.5 py-1">
      <span className="relative flex h-2 w-2">
        {c.pulse && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c.color} opacity-75`}></span>}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${c.color}`}></span>
      </span>
      <span className="text-[10px] text-gray-500 font-medium">{label}:</span>
      <span className="text-[10px] text-xero-dark font-semibold">{c.text}</span>
    </div>
  );
}

export default App;
