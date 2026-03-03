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
  const [stocktakeCsv, setStocktakeCsv] = useState('');
  const [stocktakeFileName, setStocktakeFileName] = useState('');
  const [payrollCsv, setPayrollCsv] = useState('');
  const [payrollFileName, setPayrollFileName] = useState('');
  const [bankCsv, setBankCsv] = useState('');
  const [bankFileName, setBankFileName] = useState('');
  const fileRef = useRef();
  const stocktakeRef = useRef();
  const payrollRef = useRef();
  const bankRef = useRef();

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

  // ─── Generic multi-format file reader ─────────────────────────────────
  const readFileAsCsv = async (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_csv(ws);
    } else if (ext === 'json') {
      const raw = await file.text();
      const data = JSON.parse(raw);
      const rows = Array.isArray(data) ? data : (data.data || data.rows || data.items || [data]);
      if (!rows.length) throw new Error('No data rows found');
      const headers = Object.keys(rows[0]);
      const lines = [headers.join(',')];
      for (const row of rows) {
        lines.push(headers.map(h => {
          const v = String(row[h] ?? '');
          return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
        }).join(','));
      }
      return lines.join('\n');
    } else {
      return await file.text();
    }
  };

  const makeFileHandler = (setFileName, setCsv, label) => async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    try {
      const csv = await readFileAsCsv(file);
      setFileName(file.name);
      setCsv(csv);
    } catch (err) {
      setError(`Could not read ${label} file: ${err.message}`);
    }
  };

  const handleStocktakeFile = makeFileHandler(setStocktakeFileName, setStocktakeCsv, 'stocktake');
  const handlePayrollFile   = makeFileHandler(setPayrollFileName,   setPayrollCsv,   'payroll');
  const handleBankFile      = makeFileHandler(setBankFileName,      setBankCsv,      'bank');

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
      if (stocktakeCsv) payload.stocktake_csv = stocktakeCsv;
      if (payrollCsv)   payload.payroll_csv   = payrollCsv;
      if (bankCsv)      payload.bank_csv      = bankCsv;
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setResults(data);
      setActiveTab('dashboard');
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

  const loadSampleStocktake = () => {
    const csv = `item,unit,unit_cost,opening_qty,purchases,closing_qty
Coffee Beans (kg),kg,28.00,15,40,12
Full Cream Milk (L),litre,1.80,40,120,35
Oat Milk (L),litre,2.50,20,60,18
Almond Milk (L),litre,3.00,10,30,9
Chai Concentrate (L),litre,12.00,4,10,3
Croissants (each),unit,1.50,30,200,25
Banana Bread (loaf),unit,4.50,10,60,8
Sourdough Bread (loaf),unit,5.00,8,40,6
Free Range Eggs (dozen),dozen,6.50,5,20,4
Avocados (each),unit,1.20,15,80,10
Smoked Salmon (kg),kg,32.00,2,8,1.5
Butter (kg),kg,9.00,2,8,1.5
Mixed Greens (kg),kg,8.00,3,12,2
Disposable Cups 8oz,unit,0.18,200,600,150
Disposable Cups 12oz,unit,0.22,300,800,250
Packaging & Napkins,unit,0.15,400,1200,320`;
    setStocktakeFileName('sample_stocktake.csv');
    setStocktakeCsv(csv);
  };

  const loadSamplePayroll = () => {
    const csv = `employee,role,pay_period,hours_worked,hourly_rate,gross_pay
Emma Johnson,Head Barista,January 2026,160,28.50,4560.00
Liam Chen,Barista,January 2026,152,24.00,3648.00
Sophie Williams,Barista,January 2026,120,24.00,2880.00
Noah Anderson,Kitchen Hand,January 2026,144,22.50,3240.00
Olivia Martinez,Cafe Manager,January 2026,168,35.00,5880.00
Jack Thompson,Casual Barista,January 2026,64,24.00,1536.00
Mia Davis,Waitstaff,January 2026,128,22.50,2880.00
Ethan Wilson,Kitchen Hand,January 2026,96,22.50,2160.00
Isabella Brown,Casual Waitstaff,January 2026,48,22.50,1080.00
Ava Taylor,Barista,January 2026,140,24.00,3360.00`;
    setPayrollFileName('sample_payroll.csv');
    setPayrollCsv(csv);
  };

  const loadSampleBank = () => {
    const csv = `date,description,debit,credit
2026-01-03,Melbourne Commercial Rent - January,3800.00,
2026-01-04,ORIGIN ENERGY - electricity bill,420.00,
2026-01-04,Five Senses Coffee - bean order,980.00,
2026-01-05,Aussie Farmers Direct - produce,340.00,
2026-01-07,Tip Top Bakery - pastries & bread,220.00,
2026-01-08,Aus Dairy Co - milk order,185.00,
2026-01-09,Cleaning Solutions Pty Ltd,95.00,
2026-01-10,OPTUS - phone & internet,89.00,
2026-01-10,Five Senses Coffee - bean order,840.00,
2026-01-12,Instagram Ads - Jan campaign,150.00,
2026-01-13,Aus Dairy Co - milk order,175.00,
2026-01-14,Tip Top Bakery - pastries & bread,210.00,
2026-01-15,Five Senses Coffee - bean order,920.00,
2026-01-16,Aussie Farmers Direct - produce,310.00,
2026-01-17,Allianz Insurance - public liability,220.00,
2026-01-18,Cleaning Solutions Pty Ltd,95.00,
2026-01-19,Aus Dairy Co - milk order,190.00,
2026-01-20,Packaging Plus - cups & lids,385.00,
2026-01-22,Five Senses Coffee - bean order,1080.00,
2026-01-23,Aussie Farmers Direct - produce,295.00,
2026-01-24,XERO - accounting software,65.00,
2026-01-25,Cleaning Solutions Pty Ltd,95.00,
2026-01-25,Aus Dairy Co - milk order,182.00,
2026-01-26,Facebook Ads,100.00,
2026-01-27,Tip Top Bakery - pastries & bread,215.00,
2026-01-28,ANZ Bank Fee - merchant service,48.00,
2026-01-29,Five Senses Coffee - bean order,760.00,
2026-01-30,Aussie Farmers Direct - produce,320.00,
2026-01-31,Aus Dairy Co - milk order,178.00`;
    setBankFileName('sample_bank_transactions.csv');
    setBankCsv(csv);
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
          {['upload', 'dashboard', 'report', 'ai'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              disabled={tab !== 'upload' && !results}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab
                  ? 'bg-white text-xero-dark shadow-sm'
                  : 'text-gray-500 hover:text-xero-dark disabled:opacity-30 disabled:cursor-not-allowed'
              }`}
            >
              {{'upload':'Upload','dashboard':'📊 Dashboard','report':'Report','ai':'AI Insights'}[tab]}
            </button>
          ))}
        </div>

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="bg-white border border-dark-600/50 rounded-2xl p-6 md:p-8 shadow-sm">
            <h2 className="text-xl font-semibold mb-2 text-xero-dark">Upload Cafe Data</h2>
            <p className="text-sm text-gray-500 mb-6">Upload files from your POS, stocktake, payroll, and bank. Only Sales is required — each extra file unlocks deeper metrics.</p>

            {/* Row 1: Sales + Time Period */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-xero-blue text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">1</span>
                  <label className="text-sm font-medium text-xero-dark">POS Sales File <span className="text-red-400">*</span></label>
                </div>
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.json" onChange={handleFile} className="hidden" />
                <div className="flex gap-2">
                  <button onClick={() => fileRef.current?.click()}
                    className="flex-1 bg-dark-700 border border-dashed border-dark-600 rounded-xl py-3 px-4 text-gray-500 hover:border-xero-blue/50 hover:text-xero-dark transition-all text-left text-sm truncate">
                    {fileName || 'Square, Lightspeed, Toast, Clover…'}
                  </button>
                  <button onClick={loadSample} className="text-xs text-xero-blue hover:text-xero-teal font-medium px-3 py-3 rounded-xl border border-dark-600/50 hover:border-xero-blue/30 transition-all whitespace-nowrap">
                    Sample
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">CSV, Excel (.xlsx), or JSON</p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-gray-400 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">⏱</span>
                  <label className="text-sm font-medium text-xero-dark">Data Time Period</label>
                </div>
                <div className="flex gap-2">
                  {[{v:'1',l:'1 Month'},{v:'3',l:'3 Months'},{v:'6',l:'6 Months'},{v:'12',l:'1 Year'}].map(({v,l}) => (
                    <button key={v} onClick={() => setTimePeriod(v)}
                      className={`flex-1 py-3 px-2 rounded-xl text-sm font-medium border transition-all ${
                        timePeriod === v ? 'bg-xero-blue text-white border-xero-blue shadow-sm' : 'bg-dark-700 text-gray-500 border-dark-600 hover:border-xero-blue/50 hover:text-xero-dark'
                      }`}>{l}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: Stocktake + Payroll */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">2</span>
                  <label className="text-sm font-medium text-xero-dark">Stocktake Sheet <span className="text-gray-400 font-normal">(optional)</span></label>
                </div>
                <input ref={stocktakeRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.json" onChange={handleStocktakeFile} className="hidden" />
                <div className="flex gap-2">
                  <button onClick={() => stocktakeRef.current?.click()}
                    className="flex-1 bg-dark-700 border border-dashed border-dark-600 rounded-xl py-3 px-4 text-gray-500 hover:border-emerald-400/50 hover:text-xero-dark transition-all text-left text-sm truncate">
                    {stocktakeFileName || 'Opening stock, purchases, closing stock…'}
                  </button>
                  <button onClick={loadSampleStocktake} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium px-3 py-3 rounded-xl border border-dark-600/50 hover:border-emerald-300 transition-all whitespace-nowrap">Sample</button>
                  {stocktakeFileName && <button onClick={() => { setStocktakeCsv(''); setStocktakeFileName(''); if(stocktakeRef.current) stocktakeRef.current.value=''; }}
                    className="text-xs text-loss px-3 py-3 rounded-xl border border-dark-600/50 hover:border-red-300 transition-all">✕</button>}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Unlocks <strong>True COGS</strong> — accounts for wastage &amp; purchases</p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-violet-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">3</span>
                  <label className="text-sm font-medium text-xero-dark">Payroll Summary <span className="text-gray-400 font-normal">(optional)</span></label>
                </div>
                <input ref={payrollRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.json" onChange={handlePayrollFile} className="hidden" />
                <div className="flex gap-2">
                  <button onClick={() => payrollRef.current?.click()}
                    className="flex-1 bg-dark-700 border border-dashed border-dark-600 rounded-xl py-3 px-4 text-gray-500 hover:border-violet-400/50 hover:text-xero-dark transition-all text-left text-sm truncate">
                    {payrollFileName || 'Staff wages, hours, pay runs…'}
                  </button>
                  <button onClick={loadSamplePayroll} className="text-xs text-violet-600 hover:text-violet-700 font-medium px-3 py-3 rounded-xl border border-dark-600/50 hover:border-violet-300 transition-all whitespace-nowrap">Sample</button>
                  {payrollFileName && <button onClick={() => { setPayrollCsv(''); setPayrollFileName(''); if(payrollRef.current) payrollRef.current.value=''; }}
                    className="text-xs text-loss px-3 py-3 rounded-xl border border-dark-600/50 hover:border-red-300 transition-all">✕</button>}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Unlocks <strong>Labour %</strong> and <strong>Prime Cost %</strong></p>
              </div>
            </div>

            {/* Row 3: Bank + Fixed Costs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">4</span>
                  <label className="text-sm font-medium text-xero-dark">Bank Transactions <span className="text-gray-400 font-normal">(optional)</span></label>
                </div>
                <input ref={bankRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.json" onChange={handleBankFile} className="hidden" />
                <div className="flex gap-2">
                  <button onClick={() => bankRef.current?.click()}
                    className="flex-1 bg-dark-700 border border-dashed border-dark-600 rounded-xl py-3 px-4 text-gray-500 hover:border-amber-400/50 hover:text-xero-dark transition-all text-left text-sm truncate">
                    {bankFileName || 'Bank statement export…'}
                  </button>
                  <button onClick={loadSampleBank} className="text-xs text-amber-600 hover:text-amber-700 font-medium px-3 py-3 rounded-xl border border-dark-600/50 hover:border-amber-300 transition-all whitespace-nowrap">Sample</button>
                  {bankFileName && <button onClick={() => { setBankCsv(''); setBankFileName(''); if(bankRef.current) bankRef.current.value=''; }}
                    className="text-xs text-loss px-3 py-3 rounded-xl border border-dark-600/50 hover:border-red-300 transition-all">✕</button>}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Unlocks <strong>Expense Breakdown</strong> — rent, utilities, suppliers</p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-gray-400 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">$</span>
                  <label className="text-sm font-medium text-xero-dark">Monthly Fixed Costs <span className="text-gray-400 font-normal">(manual fallback)</span></label>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                  <input type="number" min="0" value={fixedCosts} onChange={(e) => setFixedCosts(e.target.value)}
                    placeholder="e.g. 3500"
                    className="w-full bg-dark-700 border border-dark-600 rounded-xl pl-8 pr-4 py-3 text-xero-dark focus:outline-none focus:border-xero-blue/50 focus:ring-1 focus:ring-xero-blue/20 transition-all" />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Rent, overheads — use if no bank file uploaded</p>
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

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && results && (
          <KPIDashboard results={results} />
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
                {results.stocktake_used && (
                  <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded border border-emerald-200 font-medium">
                    ✓ Stocktake — True COGS ${results.stocktake_data?.true_cogs?.toLocaleString()}
                  </span>
                )}
                {results.payroll_used && (
                  <span className="text-[11px] bg-violet-50 text-violet-700 px-2.5 py-1 rounded border border-violet-200 font-medium">
                    ✓ Payroll — Labour ${results.metrics.summary.labour_cost?.toLocaleString()} ({results.metrics.summary.labour_pct}%)
                  </span>
                )}
                {results.bank_used && (
                  <span className="text-[11px] bg-amber-50 text-amber-700 px-2.5 py-1 rounded border border-amber-200 font-medium">
                    ✓ Bank — ${results.metrics.summary.bank_expenses?.toLocaleString()} expenses
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

            {(s.labour_cost > 0 || s.prime_cost > 0) && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {s.labour_cost > 0 && (
                  <XeroKPI label="Labour Cost" value={`$${s.labour_cost?.toLocaleString()}`} sub={`${s.labour_pct}% of revenue`} color={s.labour_pct <= 35 ? 'gain' : s.labour_pct <= 40 ? 'accent' : 'loss'} />
                )}
                {s.labour_cost > 0 && (
                  <XeroKPI label="Labour %" value={`${s.labour_pct}%`} sub="Benchmark: 30–35%" color={s.labour_pct <= 35 ? 'gain' : s.labour_pct <= 40 ? 'accent' : 'loss'} />
                )}
                {s.prime_cost > 0 && (
                  <XeroKPI label="Prime Cost" value={`$${s.prime_cost?.toLocaleString()}`} sub="COGS + Labour" />
                )}
                {s.prime_cost > 0 && (
                  <XeroKPI label="Prime Cost %" value={`${s.prime_cost_pct}%`} sub="Benchmark: <60%" color={s.prime_cost_pct < 60 ? 'gain' : s.prime_cost_pct < 70 ? 'accent' : 'loss'} />
                )}
              </div>
            )}

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
                    <XeroPLRow label={tp > 1 ? `Less Fixed Costs ($${s.monthly_fixed_costs?.toLocaleString() ?? s.fixed_costs}/mo × ${tp}mo)` : 'Less Fixed Costs'} value={s.fixed_costs} indent deduct />
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

            {/* Bank Expense Breakdown */}
            {results.bank_used && results.metrics.expense_categories && Object.keys(results.metrics.expense_categories).length > 0 && (
              <div className="bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
                <div className="h-1 bg-amber-400"></div>
                <div className="px-5 pt-4 pb-2">
                  <h3 className="text-sm font-semibold text-xero-dark uppercase tracking-wide">Bank Expense Breakdown</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">Total: ${s.bank_expenses?.toLocaleString()} from bank transactions</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] text-gray-400 uppercase tracking-wider border-b border-dark-600/30">
                        <th className="text-left px-5 pb-2">Category</th>
                        <th className="text-right px-5 pb-2">Amount</th>
                        <th className="text-right px-5 pb-2">% of Expenses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(results.metrics.expense_categories)
                        .sort(([,a],[,b]) => b - a)
                        .map(([cat, amt]) => (
                          <tr key={cat} className="border-b border-dark-600/20 last:border-0">
                            <td className="px-5 py-2.5 font-medium text-xero-dark">{cat}</td>
                            <td className="px-5 py-2.5 text-right text-xero-dark">${amt.toLocaleString()}</td>
                            <td className="px-5 py-2.5 text-right text-gray-500">
                              {s.bank_expenses > 0 ? ((amt / s.bank_expenses) * 100).toFixed(1) : '0.0'}%
                            </td>
                          </tr>
                        ))}
                    </tbody>
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

// ─── Health Score Calculator ─────────────────────────────────────────────────
function computeHealthScore(s) {
  const scores = [];
  if (s.total_cogs > 0 && s.total_revenue > 0) {
    const fc = s.food_cost_pct;
    scores.push(fc <= 28 ? 100 : fc <= 32 ? 85 : fc <= 35 ? 65 : fc <= 38 ? 40 : 15);
  }
  const gm = s.gross_margin_pct;
  scores.push(gm >= 70 ? 100 : gm >= 65 ? 85 : gm >= 55 ? 60 : gm >= 45 ? 35 : 10);
  const nm = s.net_margin_pct;
  scores.push(nm >= 15 ? 100 : nm >= 10 ? 85 : nm >= 5 ? 60 : nm >= 0 ? 30 : 5);
  if (s.labour_pct > 0) {
    const lp = s.labour_pct;
    scores.push(lp <= 30 ? 100 : lp <= 35 ? 85 : lp <= 40 ? 55 : lp <= 45 ? 30 : 10);
  }
  if (s.prime_cost_pct > 0) {
    const pc = s.prime_cost_pct;
    scores.push(pc <= 55 ? 100 : pc <= 60 ? 80 : pc <= 65 ? 55 : pc <= 70 ? 30 : 10);
  }
  return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 50;
}

// ─── KPI Dashboard Component ─────────────────────────────────────────────────
function KPIDashboard({ results }) {
  const s = results.metrics.summary;
  const tp = results.time_period_months || 1;
  const PERIOD_LABELS = { '1': '1 Month', '3': '3 Months', '6': '6 Months', '12': '1 Year' };
  const POS_LABELS = { square: 'Square POS', square_summary: 'Square Summary', lightspeed: 'Lightspeed', toast: 'Toast', clover: 'Clover', shopify: 'Shopify', generic: 'Custom CSV' };

  const score = computeHealthScore(s);
  const scoreColor = score >= 75 ? '#1dab57' : score >= 55 ? '#f59e0b' : '#d94a4a';
  const scoreLabel = score >= 75 ? 'Healthy' : score >= 55 ? 'Needs Work' : 'At Risk';
  const CIRC = 263.9;
  const dash = (score / 100) * CIRC;

  const dailyData = Object.entries(results.metrics.daily || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-31);
  const maxDaily = Math.max(...dailyData.map(([, d]) => d.revenue), 1);

  const cats = Object.entries(results.metrics.categories || {})
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .slice(0, 6);

  const topItems = results.metrics.top_items?.slice(0, 6) || [];
  const maxItemProfit = Math.max(...topItems.map(i => i.profit), 1);
  const maxItemRevenue = Math.max(...topItems.map(i => i.revenue), 1);

  const benchmarks = [
    { label: 'Food Cost %', value: s.food_cost_pct, max: 60, good: v => v <= 32, ok: v => v <= 38, benchmark: '28–32%' },
    { label: 'Gross Margin %', value: s.gross_margin_pct, max: 100, good: v => v >= 65, ok: v => v >= 50, benchmark: '65–70%', invert: true },
    { label: 'Net Margin %', value: s.net_margin_pct, max: 30, good: v => v >= 10, ok: v => v >= 5, benchmark: '5–15%', invert: true },
  ];
  if (s.labour_pct > 0) benchmarks.push({ label: 'Labour %', value: s.labour_pct, max: 60, good: v => v <= 35, ok: v => v <= 40, benchmark: '30–35%' });
  if (s.prime_cost_pct > 0) benchmarks.push({ label: 'Prime Cost %', value: s.prime_cost_pct, max: 100, good: v => v <= 60, ok: v => v <= 70, benchmark: '<60%' });

  const CAT_COLORS = ['#13B5EA', '#1dab57', '#8b5cf6', '#f59e0b', '#ef4444', '#0CAADC'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
        <div className="h-1 bg-gradient-to-r from-xero-blue to-xero-teal"></div>
        <div className="px-5 py-3">
          <h2 className="text-base font-semibold text-xero-dark">KPI Dashboard</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {results.rows_processed} transactions
            {' · '}{s.num_days} day{s.num_days !== 1 ? 's' : ''}
            {' · '}{PERIOD_LABELS[String(tp)] || `${tp} months`}
            {results.pos_format_detected && ` · ${POS_LABELS[results.pos_format_detected] || results.pos_format_detected}`}
          </p>
        </div>
      </div>

      {/* Row 1: Health Score + Benchmarks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Health Score Ring */}
        <div className="bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
          <div className="h-1" style={{ backgroundColor: scoreColor }}></div>
          <div className="p-6 flex flex-col items-center justify-center">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-4">Cafe Health Score</p>
            <svg viewBox="0 0 100 100" className="w-36 h-36">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#edf0f5" strokeWidth="9" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke={scoreColor} strokeWidth="9" strokeLinecap="round"
                strokeDasharray={`${dash} ${CIRC}`}
                transform="rotate(-90 50 50)"
              />
              <text x="50" y="47" textAnchor="middle" fill="#1B2A4A" fontSize="24" fontWeight="bold" fontFamily="system-ui, sans-serif">{score}</text>
              <text x="50" y="61" textAnchor="middle" fill="#9ca3af" fontSize="10" fontFamily="system-ui, sans-serif">/100</text>
            </svg>
            <p className="text-base font-bold mt-2" style={{ color: scoreColor }}>{scoreLabel}</p>
            <p className="text-[11px] text-gray-400 mt-1 text-center max-w-[160px]">Based on {benchmarks.length} margin metrics vs industry</p>
          </div>
        </div>

        {/* Benchmark Bars */}
        <div className="lg:col-span-2 bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
          <div className="h-1 bg-xero-blue"></div>
          <div className="px-5 pt-4 pb-2">
            <h3 className="text-sm font-semibold text-xero-dark uppercase tracking-wide">Industry Benchmarks</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">How your key metrics compare</p>
          </div>
          <div className="px-5 pb-5 space-y-4">
            {benchmarks.map((b) => {
              const isGood = b.good(b.value);
              const isOk = !isGood && b.ok(b.value);
              const barColor = isGood ? '#1dab57' : isOk ? '#f59e0b' : '#d94a4a';
              const clampedPct = Math.min(Math.max((Math.abs(b.value) / b.max) * 100, 0), 100);
              return (
                <div key={b.label}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-medium text-xero-dark">{b.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tabular-nums" style={{ color: barColor }}>{b.value}%</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
                        isGood ? 'bg-green-50 text-green-700 border-green-200' : isOk ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {isGood ? '✓' : isOk ? '~' : '!'} target {b.benchmark}
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-dark-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${clampedPct}%`, backgroundColor: barColor, transition: 'width 0.8s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 2: Summary KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Revenue', value: `$${s.total_revenue.toLocaleString()}` },
          { label: 'Gross Profit', value: `$${s.gross_profit.toLocaleString()}`, color: s.gross_profit >= 0 ? 'gain' : 'loss' },
          { label: 'Net Profit', value: `$${s.net_profit.toLocaleString()}`, color: s.net_profit >= 0 ? 'gain' : 'loss' },
          { label: 'Avg Order', value: `$${s.avg_order_value}` },
          { label: 'Units Sold', value: s.total_units_sold.toLocaleString() },
          { label: 'Daily Revenue', value: `$${s.avg_daily_revenue}`, sub: `${s.avg_daily_transactions} txns/day` },
        ].map(kpi => (
          <XeroKPI key={kpi.label} label={kpi.label} value={kpi.value} sub={kpi.sub} color={kpi.color} />
        ))}
      </div>

      {/* Row 3: Daily Revenue Chart + Category Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Daily Revenue Bar Chart */}
        {dailyData.length > 0 && (
          <div className="bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
            <div className="h-1 bg-xero-teal"></div>
            <div className="px-5 pt-4 pb-3">
              <h3 className="text-sm font-semibold text-xero-dark uppercase tracking-wide">Daily Revenue</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Avg ${s.avg_daily_revenue} / day over {dailyData.length} days</p>
            </div>
            <div className="px-4 pb-4">
              <div className="flex items-end gap-px" style={{ height: '112px' }}>
                {dailyData.map(([date, d]) => {
                  const heightPct = Math.max((d.revenue / maxDaily) * 100, 2);
                  const isAboveAvg = d.revenue >= s.avg_daily_revenue;
                  return (
                    <div key={date} className="flex-1 relative group flex flex-col justify-end" style={{ height: '100%' }}>
                      <div
                        className="w-full rounded-t transition-all"
                        style={{ height: `${heightPct}%`, backgroundColor: isAboveAvg ? '#13B5EA' : '#0CAADC88' }}
                      />
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-xero-dark text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap pointer-events-none">
                        {date.slice(5)} — ${d.revenue.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1.5 text-[9px] text-gray-400">
                <span>{dailyData[0]?.[0]?.slice(5)}</span>
                {dailyData.length > 2 && <span>{dailyData[Math.floor(dailyData.length / 2)]?.[0]?.slice(5)}</span>}
                <span>{dailyData[dailyData.length - 1]?.[0]?.slice(5)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Revenue by Category */}
        {cats.length > 0 && (
          <div className="bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
            <div className="h-1 bg-violet-500"></div>
            <div className="px-5 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-xero-dark uppercase tracking-wide">Revenue by Category</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Revenue share &amp; gross margin per category</p>
            </div>
            <div className="px-5 pb-5 space-y-3.5">
              {cats.map(([cat, d], i) => {
                const revenueShare = s.total_revenue > 0 ? (d.revenue / s.total_revenue) * 100 : 0;
                const margin = d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-medium text-xero-dark truncate max-w-[130px]">{cat}</span>
                      <div className="flex items-center gap-2 text-[11px] shrink-0">
                        <span className="font-semibold text-xero-dark">${d.revenue.toLocaleString()}</span>
                        <span className="text-gray-400">{revenueShare.toFixed(0)}% share</span>
                        <span className={margin >= 60 ? 'text-gain font-semibold' : margin >= 35 ? 'text-amber-500' : 'text-loss'}>{margin.toFixed(0)}% margin</span>
                      </div>
                    </div>
                    <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${revenueShare}%`, backgroundColor: CAT_COLORS[i % CAT_COLORS.length], transition: 'width 0.8s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Row 4: Top Items dual bar */}
      {topItems.length > 0 && (
        <div className="bg-white border border-dark-600/30 rounded-lg overflow-hidden shadow-sm">
          <div className="h-1 bg-gain"></div>
          <div className="px-5 pt-4 pb-2 flex justify-between items-start">
            <div>
              <h3 className="text-sm font-semibold text-xero-dark uppercase tracking-wide">Top Items by Profit</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                <span className="inline-block w-2.5 h-2 rounded-sm bg-gain mr-1"></span>Profit
                <span className="inline-block w-2.5 h-2 rounded-sm bg-xero-blue/25 mr-1 ml-3"></span>Revenue
              </p>
            </div>
          </div>
          <div className="px-5 pb-5 space-y-3.5">
            {topItems.map((item, i) => {
              const profitBar = Math.max((item.profit / maxItemProfit) * 100, 0);
              const revBar = Math.max((item.revenue / maxItemRevenue) * 100, 0);
              const itemMargin = item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0;
              return (
                <div key={i}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-xero-dark truncate max-w-[200px]">{item.name}</span>
                    <div className="flex items-center gap-3 text-[11px] shrink-0">
                      <span className="text-gray-400">{item.quantity} sold</span>
                      <span className="text-gray-500">${item.revenue.toLocaleString()}</span>
                      <span className="font-bold text-gain">${item.profit.toLocaleString()}</span>
                      <span className={`font-semibold ${itemMargin >= 60 ? 'text-gain' : itemMargin >= 35 ? 'text-amber-500' : 'text-loss'}`}>{itemMargin.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="relative h-2.5 bg-dark-700 rounded-full overflow-hidden">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-xero-blue/25" style={{ width: `${revBar}%` }} />
                    <div className="absolute inset-y-0 left-0 rounded-full bg-gain" style={{ width: `${profitBar}%`, transition: 'width 0.8s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
