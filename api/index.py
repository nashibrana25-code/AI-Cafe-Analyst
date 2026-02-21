"""
AI Cafe Analyst — Serverless API
Python stdlib only (no pip dependencies) for Vercel compatibility.
Groq AI (Llama 3.3 70B) for free financial recommendations.
"""

import json
import os
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler
from datetime import datetime

GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
GROQ_MODEL = 'llama-3.3-70b-versatile'


# ─── Financial Engine ────────────────────────────────────────────────────────

def compute_metrics(rows, fixed_costs=0):
    """
    Compute cafe financial metrics from transaction rows.
    Each row: { date, item, category, price, cost, quantity }
    """
    total_revenue = 0
    total_cogs = 0
    total_units = 0
    items = {}
    categories = {}
    daily = {}

    for r in rows:
        price = _num(r, ['price', 'sale_price', 'selling_price', 'revenue', 'amount'])
        cost = _num(r, ['cost', 'cogs', 'cost_price', 'unit_cost'])
        qty = _num(r, ['quantity', 'qty', 'units_sold', 'count']) or 1
        item = _str(r, ['item', 'product', 'item_name', 'product_name', 'menu_item'])
        cat = _str(r, ['category', 'type', 'group'])
        date = _str(r, ['date', 'order_date', 'transaction_date', 'day'])

        rev = price * qty
        cog = cost * qty
        profit = rev - cog

        total_revenue += rev
        total_cogs += cog
        total_units += qty

        # Per-item breakdown
        if item:
            if item not in items:
                items[item] = {'revenue': 0, 'cost': 0, 'quantity': 0, 'profit': 0}
            items[item]['revenue'] += rev
            items[item]['cost'] += cog
            items[item]['quantity'] += qty
            items[item]['profit'] += profit

        # Per-category breakdown
        if cat:
            if cat not in categories:
                categories[cat] = {'revenue': 0, 'cost': 0, 'quantity': 0, 'profit': 0}
            categories[cat]['revenue'] += rev
            categories[cat]['cost'] += cog
            categories[cat]['quantity'] += qty
            categories[cat]['profit'] += profit

        # Daily breakdown
        if date:
            if date not in daily:
                daily[date] = {'revenue': 0, 'cost': 0, 'transactions': 0}
            daily[date]['revenue'] += rev
            daily[date]['cost'] += cog
            daily[date]['transactions'] += 1

    gross_profit = total_revenue - total_cogs
    gross_margin = (gross_profit / total_revenue * 100) if total_revenue else 0
    net_profit = gross_profit - fixed_costs
    net_margin = (net_profit / total_revenue * 100) if total_revenue else 0
    food_cost_pct = (total_cogs / total_revenue * 100) if total_revenue else 0
    avg_order_value = (total_revenue / total_units) if total_units else 0

    # Break-even (units needed to cover fixed costs)
    avg_contribution = (gross_profit / total_units) if total_units else 0
    break_even_units = int(fixed_costs / avg_contribution) if avg_contribution > 0 else 0

    # Top items by profit
    top_items = sorted(items.items(), key=lambda x: x[1]['profit'], reverse=True)[:10]
    worst_items = sorted(items.items(), key=lambda x: x[1]['profit'])[:5]

    # Daily averages
    num_days = len(daily) or 1
    avg_daily_revenue = total_revenue / num_days
    avg_daily_transactions = sum(d['transactions'] for d in daily.values()) / num_days

    return {
        'summary': {
            'total_revenue': _r(total_revenue),
            'total_cogs': _r(total_cogs),
            'gross_profit': _r(gross_profit),
            'gross_margin_pct': _r(gross_margin),
            'fixed_costs': _r(fixed_costs),
            'net_profit': _r(net_profit),
            'net_margin_pct': _r(net_margin),
            'food_cost_pct': _r(food_cost_pct),
            'total_units_sold': total_units,
            'avg_order_value': _r(avg_order_value),
            'break_even_units': break_even_units,
            'num_days': num_days,
            'avg_daily_revenue': _r(avg_daily_revenue),
            'avg_daily_transactions': _r(avg_daily_transactions),
        },
        'top_items': [
            {'name': name, **{k: _r(v) if isinstance(v, float) else v for k, v in data.items()}}
            for name, data in top_items
        ],
        'worst_items': [
            {'name': name, **{k: _r(v) if isinstance(v, float) else v for k, v in data.items()}}
            for name, data in worst_items
        ],
        'categories': {
            cat: {k: _r(v) if isinstance(v, float) else v for k, v in data.items()}
            for cat, data in sorted(categories.items(), key=lambda x: x[1]['revenue'], reverse=True)
        },
        'daily': {
            date: {k: _r(v) if isinstance(v, float) else v for k, v in data.items()}
            for date, data in sorted(daily.items())
        },
    }


# ─── Groq AI ─────────────────────────────────────────────────────────────────

def call_groq(prompt, max_tokens=600):
    """Call Groq API (free tier: 30 req/min, 14,400/day)."""
    if not GROQ_API_KEY:
        return None

    body = json.dumps({
        'model': GROQ_MODEL,
        'messages': [
            {
                'role': 'system',
                'content': (
                    'You are an expert cafe business and financial analyst. '
                    'Provide specific, actionable, data-driven recommendations. '
                    'Focus on: cost control, pricing strategy, menu optimization, '
                    'labor efficiency, waste reduction, and revenue growth. '
                    'Use the numbers provided. Be direct and practical. '
                    'Format with clear headers and bullet points.'
                ),
            },
            {'role': 'user', 'content': prompt},
        ],
        'max_tokens': max_tokens,
        'temperature': 0.4,
    }).encode()

    req = urllib.request.Request(
        'https://api.groq.com/openai/v1/chat/completions',
        data=body,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {GROQ_API_KEY}',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            return data['choices'][0]['message']['content']
    except Exception as e:
        return f'AI analysis unavailable: {e}'


def build_prompt(metrics):
    """Build a detailed prompt from computed metrics."""
    s = metrics['summary']
    top = metrics.get('top_items', [])[:5]
    worst = metrics.get('worst_items', [])[:3]

    top_str = '\n'.join(
        f"  - {i['name']}: revenue ${i['revenue']}, cost ${i['cost']}, profit ${i['profit']}, qty {i['quantity']}"
        for i in top
    )
    worst_str = '\n'.join(
        f"  - {i['name']}: revenue ${i['revenue']}, cost ${i['cost']}, profit ${i['profit']}, qty {i['quantity']}"
        for i in worst
    )

    cat_str = '\n'.join(
        f"  - {cat}: revenue ${d['revenue']}, cost ${d['cost']}, profit ${d['profit']}"
        for cat, d in metrics.get('categories', {}).items()
    )

    return f"""Analyze this cafe's financial data and provide 6-8 specific, prioritized recommendations.

FINANCIAL SUMMARY:
- Total Revenue: ${s['total_revenue']}
- Total COGS: ${s['total_cogs']}
- Gross Profit: ${s['gross_profit']} (Margin: {s['gross_margin_pct']}%)
- Fixed Costs: ${s['fixed_costs']}
- Net Profit: ${s['net_profit']} (Margin: {s['net_margin_pct']}%)
- Food Cost %: {s['food_cost_pct']}%
- Avg Order Value: ${s['avg_order_value']}
- Break-even: {s['break_even_units']} units
- Avg Daily Revenue: ${s['avg_daily_revenue']}
- Avg Daily Transactions: {s['avg_daily_transactions']}

TOP SELLING ITEMS:
{top_str}

LOWEST PERFORMING ITEMS:
{worst_str}

CATEGORY BREAKDOWN:
{cat_str}

Industry benchmarks: food cost 28-32%, gross margin 65-70%, net margin 5-15%.

Provide:
1. URGENT actions (quick wins this week)
2. PRICING recommendations (specific items to reprice)
3. MENU optimization (what to promote, what to remove)
4. COST REDUCTION strategies
5. REVENUE GROWTH opportunities
6. CASH FLOW advice"""


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _num(row, keys):
    for k in keys:
        for rk in row:
            if rk.strip().lower().replace(' ', '_') == k:
                try:
                    return float(str(row[rk]).replace('$', '').replace(',', '').strip())
                except (ValueError, TypeError):
                    pass
    return 0


def _str(row, keys):
    for k in keys:
        for rk in row:
            if rk.strip().lower().replace(' ', '_') == k:
                v = str(row[rk]).strip()
                if v and v.lower() != 'nan':
                    return v
    return ''


def _r(n):
    return round(n, 2)


def parse_csv_text(text):
    """Parse CSV text into list of dicts. Stdlib only."""
    lines = [l.strip() for l in text.strip().split('\n') if l.strip()]
    if not lines:
        return []

    # Detect delimiter
    first = lines[0]
    delim = ',' if first.count(',') >= first.count('\t') else '\t'

    headers = [h.strip().strip('"') for h in first.split(delim)]
    rows = []
    for line in lines[1:]:
        vals = [v.strip().strip('"') for v in line.split(delim)]
        if len(vals) >= len(headers):
            rows.append(dict(zip(headers, vals)))
    return rows


# ─── HTTP Handler ─────────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self._cors(204)

    def do_GET(self):
        path = self.path.split('?')[0].rstrip('/')

        if path in ('', '/api', '/api/'):
            self._json(200, {
                'name': 'AI Cafe Analyst',
                'version': '1.0.0',
                'status': 'online',
                'ai_enabled': bool(GROQ_API_KEY),
                'ai_model': GROQ_MODEL if GROQ_API_KEY else None,
                'endpoints': {
                    'POST /api/analyze': 'Upload cafe data and get financial analysis + AI recommendations',
                    'GET /api/health': 'Health check',
                },
                'timestamp': datetime.utcnow().isoformat(),
            })
        elif path == '/api/health':
            self._json(200, {'status': 'healthy', 'ai': bool(GROQ_API_KEY), 'timestamp': datetime.utcnow().isoformat()})
        else:
            self._json(404, {'error': 'Not found'})

    def do_POST(self):
        path = self.path.split('?')[0].rstrip('/')

        if path == '/api/analyze':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(length)) if length else {}

                csv_text = body.get('csv', '')
                rows = body.get('rows', [])
                fixed_costs = float(body.get('fixed_costs', 0))

                # Parse CSV if provided as text
                if csv_text and not rows:
                    rows = parse_csv_text(csv_text)

                if not rows:
                    self._json(400, {'error': 'No data provided. Send "csv" (CSV text) or "rows" (array of objects).'})
                    return

                # Compute metrics
                metrics = compute_metrics(rows, fixed_costs)

                # Get AI recommendations
                prompt = build_prompt(metrics)
                ai_text = call_groq(prompt)

                result = {
                    'metrics': metrics,
                    'ai_recommendations': ai_text or 'Set GROQ_API_KEY environment variable for free AI recommendations (get key at console.groq.com).',
                    'ai_enabled': bool(GROQ_API_KEY),
                    'analyzed_at': datetime.utcnow().isoformat(),
                    'rows_processed': len(rows),
                }

                self._json(200, result)

            except Exception as e:
                self._json(500, {'error': str(e)})
        else:
            self._json(404, {'error': 'Not found. Use POST /api/analyze'})

    def _json(self, code, data):
        self._cors(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _cors(self, code):
        self.send_response(code)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, *args):
        pass  # Silence logs in serverless
