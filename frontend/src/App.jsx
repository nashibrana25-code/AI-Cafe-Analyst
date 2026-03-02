import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL || '';

function App() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fixedCosts, setFixedCosts] = useState('');
  const [timePeriod, setTimePeriod] = useState('1');
  const [activeTab, setActiveTab] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [backendStatus, setBackendStatus] = useState('checking');
  const [aiStatus, setAiStatus] = useState('checking');
  const [csvText, setCsvText] = useState('');
  const [expenseCsvText, setExpenseCsvText] = useState('');
  const [expenseFileName, setExpenseFileName] = useState('');
  const fileRef = useRef();
  const expenseFileRef = useRef();

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

  // ─── File Upload (CSV, Excel, JSON) ────────────────────────────────────
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError('');

    const ext = file.name.split('.').pop().toLowerCase();

    try {
      if (ext === 'xlsx' || ext === 'xls') {
        // Excel: parse with SheetJS, convert first sheet to CSV
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(ws);
        setCsvText(csv);
      } else if (ext === 'json') {
        // JSON: convert array of objects to CSV
        const raw = await file.text();
        const data = JSON.parse(raw);
        const rows = Array.isArray(data) ? data : (data.data || data.rows || data.items || [data]);
        if (!rows.length) throw new Error('JSON file has no data rows');
        const headers = Object.keys(rows[0]);
        const csvLines = [headers.join(',')];
        for (const row of rows) {
          csvLines.push(headers.map(h => {
            const v = String(row[h] ?? '');
            return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
          }).join(','));
        }
        setCsvText(csvLines.join('\n'));
      } else {
        // CSV / TSV / TXT: read as text
        const text = await file.text();
        setCsvText(text);
      }
    } catch (err) {
      setError(`Could not read file: ${err.message}`);
      setCsvText('');
      setFileName('');
    }
  };

  // ─── Expense File Upload (CSV, Excel, JSON) ───────────────────────────
  const handleExpenseFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setExpenseFileName(file.name);
    setError('');

    const ext = file.name.split('.').pop().toLowerCase();

    try {
      if (ext === 'xlsx' || ext === 'xls') {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(ws);
        setExpenseCsvText(csv);
      } else if (ext === 'json') {
        const raw = await file.text();
        const data = JSON.parse(raw);
        const rows = Array.isArray(data) ? data : (data.data || data.rows || data.items || [data]);
        if (!rows.length) throw new Error('JSON file has no data rows');
        const headers = Object.keys(rows[0]);
        const csvLines = [headers.join(',')];
        for (const row of rows) {
          csvLines.push(headers.map(h => {
            const v = String(row[h] ?? '');
            return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
          }).join(','));
        }
        setExpenseCsvText(csvLines.join('\n'));
      } else {
        const text = await file.text();
        setExpenseCsvText(text);
      }
    } catch (err) {
      setError(`Could not read expense file: ${err.message}`);
      setExpenseCsvText('');
      setExpenseFileName('');
    }
  };

  const analyze = async (csvText) => {
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const payload = {
        csv: csvText,
        fixed_costs: parseFloat(fixedCosts) || 0,
        time_period_months: parseFloat(timePeriod) || 1,
      };
      if (expenseCsvText) payload.expense_csv = expenseCsvText;
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    setCsvText(csv);
  };

  const s = results?.metrics?.summary;
  const tp = results?.time_period_months || 1;
  const PERIOD_LABELS = {'1':'1 Month','3':'3 Months','6':'6 Months','12':'1 Year'};

  const POS_LABELS = {
    square: 'Square POS',
    square_summary: 'Square POS (Summary)',
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
            <p className="text-sm text-gray-500 mb-6">Upload a CSV, Excel (.xlsx), or JSON file from your POS system. We auto-detect the format.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm text-gray-500 mb-2">Sales Data File <span className="text-red-400">*</span></label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xls,.json"
                  onChange={handleFile}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex-1 bg-dark-700 border border-dashed border-dark-600 rounded-xl py-3 px-4 text-gray-500 hover:border-xero-blue/50 hover:text-xero-dark transition-all text-left"
                  >
                    {fileName || 'Choose file (CSV, Excel, JSON)...'}
                  </button>
                  <button
                    onClick={loadSample}
                    className="text-xs text-xero-blue hover:text-xero-teal font-medium px-3 py-3 rounded-xl border border-dark-600/50 hover:border-xero-blue/30 transition-all whitespace-nowrap"
                  >
                    Use sample
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-2">Data Time Period</label>
                <div className="flex gap-2">
                  {[{v:'1',l:'1 Month'},{v:'3',l:'3 Months'},{v:'6',l:'6 Months'},{v:'12',l:'1 Year'}].map(({v,l}) => (
                    <button
                      key={v}
                      onClick={() => setTimePeriod(v)}
                      className={`flex-1 py-3 px-2 rounded-xl text-sm font-medium border transition-all ${
                        timePeriod === v
                          ? 'bg-xero-blue text-white border-xero-blue shadow-sm'
                          : 'bg-dark-700 text-gray-500 border-dark-600 hover:border-xero-blue/50 hover:text-xero-dark'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">How much time does your sales data cover?</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm text-gray-500 mb-2">Expense / Cost File <span className="text-gray-400">(optional)</span></label>
                <input
                  ref={expenseFileRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xls,.json"
                  onChange={handleExpenseFile}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => expenseFileRef.current?.click()}
                    className="flex-1 bg-dark-700 border border-dashed border-dark-600 rounded-xl py-3 px-4 text-gray-500 hover:border-xero-blue/50 hover:text-xero-dark transition-all text-left"
                  >
                    {expenseFileName || 'Choose expense file (optional)...'}
                  </button>
                  {expenseFileName && (
                    <button
                      onClick={() => { setExpenseCsvText(''); setExpenseFileName(''); if (expenseFileRef.current) expenseFileRef.current.value = ''; }}
                      className="text-xs text-loss hover:text-red-700 font-medium px-3 py-3 rounded-xl border border-dark-600/50 hover:border-red-300 transition-all whitespace-nowrap"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">Item costs, ingredient costs, or general expenses — we'll match them to your sales data.</p>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-2">Monthly Fixed Costs <span className="text-gray-400">(optional manual entry)</span></label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                  <input
                    type="number" min="0" value={fixedCosts}
                    onChange={(e) => setFixedCosts(e.target.value)}
                    placeholder="e.g. 3500 (rent, salaries, utilities)"
                    className="w-full bg-dark-700 border border-dark-600 rounded-xl pl-8 pr-4 py-3 text-xero-dark focus:outline-none focus:border-xero-blue/50 focus:ring-1 focus:ring-xero-blue/20 transition-all"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">Rent, wages, utilities — not included in sales data.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-5">
              <button
                onClick={() => csvText && analyze(csvText)}
                disabled={!csvText || loading}
                className="bg-xero-blue hover:bg-xero-teal disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-8 py-3 rounded-xl transition-all shadow-sm"
              >
                {loading ? 'Analysing...' : 'Analyse'}
              </button>
              {csvText && !loading && (
                <span className="text-xs text-gray-400">Ready to analyse {fileName}</span>
              )}
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
                <span><strong className="text-gray-600">Other:</strong> Any CSV, Excel, or JSON with item, sales, quantity columns</span>
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

        {/* Report Tab — Xero-style */}
        {activeTab === 'report' && results && (
          <div className="space-y-5">
            {/* Report Header Bar */}
            <div className="bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
              <div className="h-1 bg-xero-blue"></div>
              <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-xero-dark">Financial Report</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {results.rows_processed} transactions · {s.num_days} day{s.num_days !== 1 ? 's' : ''}
                    {tp > 1 && <> · {PERIOD_LABELS[String(tp)] || `${tp} months`}</>}
                    {results.pos_format_detected && <> · {POS_LABELS[results.pos_format_detected] || results.pos_format_detected}</>}
                  </p>
                </div>
                {!results.metrics.summary.total_cogs && (
                  <span className="text-[11px] bg-amber-50 text-amber-700 px-2.5 py-1 rounded border border-amber-200 font-medium">
                    Add cost data for margin analysis
                  </span>
                )}
                {results.expense_file_used && (
                  <span className="text-[11px] bg-green-50 text-green-700 px-2.5 py-1 rounded border border-green-200 font-medium">
                    Expense file applied ({results.expense_items_matched} items matched{results.expense_general_added > 0 ? `, $${results.expense_general_added.toLocaleString()} added to overheads` : ''})
                  </span>
                )}
              </div>
              {/* Column detection warning */}
              {s.total_revenue === 0 && results.csv_headers && results.csv_headers.length > 0 && (
                <div className="mx-5 mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-1">Revenue is $0 — column names may not match</p>
                  <p className="text-[11px] text-amber-700 mb-1.5">
                    Your columns: <span className="font-mono">{results.csv_headers.join(', ')}</span>
                  </p>
                  <p className="text-[11px] text-amber-600">
                    We look for columns like: price, revenue, total, amount, amount_aud, sales, gross_sales. Currency-suffixed columns (e.g. Amount_AUD) are also supported.
                  </p>
                </div>
              )}
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <XeroKPI label={tp > 1 ? `Total Revenue (${PERIOD_LABELS[String(tp)] || tp+'mo'})` : 'Total Revenue'} value={`$${s.total_revenue.toLocaleString()}`} />
              <XeroKPI label="Gross Profit" value={`$${s.gross_profit.toLocaleString()}`} sub={`${s.gross_margin_pct}% margin`} color={s.gross_margin_pct >= 65 ? 'gain' : s.gross_margin_pct >= 50 ? 'accent' : 'loss'} />
              <XeroKPI label="Net Profit" value={`$${s.net_profit.toLocaleString()}`} sub={`${s.net_margin_pct}% margin`} color={s.net_profit >= 0 ? 'gain' : 'loss'} />
              <XeroKPI label="Food Cost %" value={`${s.food_cost_pct}%`} sub="Industry: 28–32%" color={s.food_cost_pct <= 32 ? 'gain' : s.food_cost_pct <= 38 ? 'accent' : 'loss'} />
            </div>

            {tp > 1 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <XeroKPI label="Monthly Revenue" value={`$${s.monthly_revenue?.toLocaleString() ?? Math.round(s.total_revenue/tp).toLocaleString()}`} sub="avg per month" color="accent" />
                <XeroKPI label="Monthly Profit" value={`$${s.monthly_net_profit?.toLocaleString() ?? Math.round(s.net_profit/tp).toLocaleString()}`} sub="avg per month" color={s.net_profit >= 0 ? 'gain' : 'loss'} />
                <XeroKPI label="Annual Projection" value={`$${s.annual_revenue?.toLocaleString() ?? Math.round(s.total_revenue/tp*12).toLocaleString()}`} sub="projected" />
                <XeroKPI label="Annual Profit" value={`$${s.annual_net_profit?.toLocaleString() ?? Math.round(s.net_profit/tp*12).toLocaleString()}`} sub="projected" color={s.net_profit >= 0 ? 'gain' : 'loss'} />
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <XeroKPI label="Avg Order Value" value={`$${s.avg_order_value}`} />
              <XeroKPI label="Units Sold" value={s.total_units_sold.toLocaleString()} />
              <XeroKPI label="Break-even" value={`${s.break_even_units} units`} sub="to cover fixed costs" />
              <XeroKPI label="Daily Avg Revenue" value={`$${s.avg_daily_revenue}`} sub={`${s.avg_daily_transactions} txns/day`} />
            </div>

            {/* Profit & Loss */}
            <div className="bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
              <div className="h-1 bg-xero-blue"></div>
              <div className="px-5 pt-4 pb-1">
                <h3 className="text-sm font-semibold text-xero-dark uppercase tracking-wide">Profit & Loss</h3>
              </div>
              <div className="px-5 pb-5">
                <table className="w-full text-sm">
                  <tbody>
                    <XeroPLRow label="Revenue" value={s.total_revenue} bold />
                    <XeroPLRow label="Less Cost of Goods Sold" value={s.total_cogs} indent deduct />
                    <XeroPLRow label="Gross Profit" value={s.gross_profit} bold border color={s.gross_profit >= 0 ? 'gain' : 'loss'} />
                    <XeroPLRow label="Less Fixed Costs" value={s.fixed_costs} indent deduct />
                    <XeroPLRow label="Net Profit" value={s.net_profit} bold border color={s.net_profit >= 0 ? 'gain' : 'loss'} />
                  </tbody>
                </table>
              </div>
            </div>

            {/* Items Performance */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Top Performers */}
              <div className="bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
                <div className="h-1 bg-gain"></div>
                <div className="px-5 pt-4 pb-2">
                  <h3 className="text-sm font-semibold text-xero-dark uppercase tracking-wide">Top Performers</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-gray-400 uppercase tracking-wider border-b border-dark-600/30">
                      <th className="text-left px-5 pb-2">Item</th>
                      <th className="text-right px-5 pb-2">Qty</th>
                      <th className="text-right px-5 pb-2">Revenue</th>
                      <th className="text-right px-5 pb-2">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.metrics.top_items.map((item, i) => (
                      <tr key={i} className="border-b border-dark-600/20 last:border-0">
                        <td className="px-5 py-2.5 font-medium text-xero-dark">{item.name}</td>
                        <td className="px-5 py-2.5 text-right text-gray-500">{item.quantity}</td>
                        <td className="px-5 py-2.5 text-right text-xero-dark">${item.revenue.toLocaleString()}</td>
                        <td className="px-5 py-2.5 text-right font-semibold text-gain">${item.profit.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Lowest Performers */}
              <div className="bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
                <div className="h-1 bg-amber-400"></div>
                <div className="px-5 pt-4 pb-2">
                  <h3 className="text-sm font-semibold text-xero-dark uppercase tracking-wide">Needs Attention</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-gray-400 uppercase tracking-wider border-b border-dark-600/30">
                      <th className="text-left px-5 pb-2">Item</th>
                      <th className="text-right px-5 pb-2">Qty</th>
                      <th className="text-right px-5 pb-2">Revenue</th>
                      <th className="text-right px-5 pb-2">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.metrics.worst_items.map((item, i) => (
                      <tr key={i} className="border-b border-dark-600/20 last:border-0">
                        <td className="px-5 py-2.5 font-medium text-xero-dark">{item.name}</td>
                        <td className="px-5 py-2.5 text-right text-gray-500">{item.quantity}</td>
                        <td className="px-5 py-2.5 text-right text-xero-dark">${item.revenue.toLocaleString()}</td>
                        <td className={`px-5 py-2.5 text-right font-semibold ${item.profit >= 0 ? 'text-amber-500' : 'text-loss'}`}>${item.profit.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Category Breakdown */}
            {Object.keys(results.metrics.categories).length > 0 && (
              <div className="bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
                <div className="h-1 bg-xero-blue"></div>
                <div className="px-5 pt-4 pb-2">
                  <h3 className="text-sm font-semibold text-xero-dark uppercase tracking-wide">By Category</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] text-gray-400 uppercase tracking-wider border-b border-dark-600/30">
                        <th className="text-left px-5 pb-2">Category</th>
                        <th className="text-right px-5 pb-2">Revenue</th>
                        <th className="text-right px-5 pb-2">Cost</th>
                        <th className="text-right px-5 pb-2">Profit</th>
                        <th className="text-right px-5 pb-2">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(results.metrics.categories).map(([cat, d]) => {
                        const margin = d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : '0.0';
                        return (
                          <tr key={cat} className="border-b border-dark-600/20 last:border-0">
                            <td className="px-5 py-2.5 font-medium text-xero-dark">{cat}</td>
                            <td className="px-5 py-2.5 text-right text-xero-dark">${d.revenue.toLocaleString()}</td>
                            <td className="px-5 py-2.5 text-right text-gray-500">${d.cost.toLocaleString()}</td>
                            <td className={`px-5 py-2.5 text-right font-semibold ${d.profit >= 0 ? 'text-gain' : 'text-loss'}`}>${d.profit.toLocaleString()}</td>
                            <td className="px-5 py-2.5 text-right text-xero-dark">{margin}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-dark-600/40 bg-dark-700/30">
                        <td className="px-5 py-2.5 font-semibold text-xero-dark">Total</td>
                        <td className="px-5 py-2.5 text-right font-semibold text-xero-dark">${s.total_revenue.toLocaleString()}</td>
                        <td className="px-5 py-2.5 text-right font-semibold text-gray-500">${s.total_cogs.toLocaleString()}</td>
                        <td className={`px-5 py-2.5 text-right font-bold ${s.gross_profit >= 0 ? 'text-gain' : 'text-loss'}`}>${s.gross_profit.toLocaleString()}</td>
                        <td className="px-5 py-2.5 text-right font-semibold text-xero-dark">{s.gross_margin_pct}%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Insights Tab — Xero-style */}
        {activeTab === 'ai' && results && (
          <div className="space-y-5">
            {/* AI Header */}
            <div className="bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
              <div className="h-1 bg-xero-blue"></div>
              <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-xero-dark">AI Recommendations</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {results.ai_enabled ? 'Llama 3.3 70B via Groq' : 'AI not configured'}
                    {' · '}{results.rows_processed} rows analyzed
                    {results.pos_format_detected && <> · {POS_LABELS[results.pos_format_detected] || results.pos_format_detected}</>}
                  </p>
                </div>
              </div>
            </div>
            <AIInsightCards text={results.ai_recommendations} />
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

// ─── Sub-components (Xero-style) ─────────────────────────────────────────

const SECTION_ACCENTS = [
  'bg-xero-blue',
  'bg-gain',
  'bg-xero-teal',
  'bg-amber-400',
  'bg-violet-500',
  'bg-rose-400',
];

function AIInsightCards({ text }) {
  if (!text) return null;

  // Split by emoji headers (🔥, 💰, 📋, ✂️, 📈, 💡)
  const sectionRegex = /([\u{1F525}\u{1F4B0}\u{1F4CB}\u{2702}\u{FE0F}?\u{1F4C8}\u{1F4A1}])\s*(.+)/gu;
  const matches = [...text.matchAll(sectionRegex)];

  if (matches.length === 0) {
    return (
      <div className="bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
        <div className="h-1 bg-xero-blue"></div>
        <div className="p-5">
          <p className="text-sm leading-relaxed text-gray-600 whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    );
  }

  const sections = matches.map((m, i) => ({
    emoji: m[1],
    title: m[2].trim(),
    body: text.slice(m.index + m[0].length, i + 1 < matches.length ? matches[i + 1].index : text.length).trim(),
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {sections.map((sec, i) => (
        <div key={i} className="bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
          <div className={`h-1 ${SECTION_ACCENTS[i % SECTION_ACCENTS.length]}`}></div>
          <div className="p-5">
            <h3 className="text-sm font-semibold text-xero-dark uppercase tracking-wide mb-3">{sec.title}</h3>
            <div className="text-[13px] leading-relaxed text-gray-600 space-y-2.5">
              {sec.body.split('\n\n').filter(Boolean).map((para, j) => (
                <p key={j}>{para.replace(/\n/g, ' ').trim()}</p>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function XeroKPI({ label, value, sub, color }) {
  const colors = { gain: 'text-gain', loss: 'text-loss', accent: 'text-xero-blue' };
  return (
    <div className="bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
      <div className="h-0.5 bg-dark-600/20"></div>
      <div className="px-4 py-3">
        <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
        <p className={`text-xl font-bold ${colors[color] || 'text-xero-dark'}`}>{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function XeroPLRow({ label, value, bold, indent, deduct, border, color }) {
  const colors = { gain: 'text-gain', loss: 'text-loss' };
  return (
    <tr className={border ? 'border-t border-dark-600/40' : ''}>
      <td className={`py-2 ${indent ? 'pl-4 text-gray-500' : ''} ${bold ? 'font-semibold text-xero-dark' : 'text-gray-600'}`}>
        {label}
      </td>
      <td className={`py-2 text-right tabular-nums ${bold ? 'font-bold' : ''} ${colors[color] || (deduct ? 'text-gray-500' : 'text-xero-dark')}`}>
        {deduct ? `(${value.toLocaleString()})` : `$${value.toLocaleString()}`}
      </td>
    </tr>
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
