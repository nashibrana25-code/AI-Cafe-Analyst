"""
AI Cafe Analyst — Serverless API
Python stdlib only (no pip dependencies) for Vercel compatibility.
Groq AI (Llama 3.3 70B) for free financial recommendations.
Supports: Square POS, Lightspeed POS, Toast, Clover, Shopify POS, and generic CSV.
"""

import json
import os
import csv
import io
import re
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler
from datetime import datetime

GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
GROQ_MODEL = 'llama-3.3-70b-versatile'


# ─── POS Format Detection & Normalization ────────────────────────────────────

# Column name mappings for each POS system
# Maps POS-specific column names -> our internal field names
POS_COLUMN_MAPS = {
    'square': {
        # Square "Items Detail" / "Transaction" CSV export
        'item': ['item', 'item_name'],
        'category': ['category'],
        'quantity': ['qty', 'quantity'],
        'gross_revenue': ['gross_sales', 'gross_revenue'],
        'net_revenue': ['net_sales', 'net_revenue'],
        'discount': ['discounts', 'discount', 'discount_amount'],
        'tax': ['tax', 'tax_amount'],
        'cost': ['cost', 'cogs', 'cost_of_goods'],
        'date': ['date', 'transaction_date'],
        'time': ['time', 'transaction_time'],
        'transaction_id': ['transaction_id', 'receipt_number', 'payment_id'],
        'sku': ['sku', 'item_sku'],
        'modifiers': ['modifiers', 'modifier'],
        'variation': ['variation', 'item_variation'],
    },
    'square_summary': {
        # Square Summary Report (Section/Type/Name/Variation/Quantity/Amount)
        'item': ['name', 'item_name', 'item'],
        'category': ['section', 'type', 'parent_item'],
        'quantity': ['quantity'],
        'gross_revenue': ['amount_aud', 'amount_nzd', 'amount_usd', 'amount_gbp',
                          'amount_eur', 'amount_cad', 'amount_jpy', 'amount_inr',
                          'amount_sgd', 'amount_hkd', 'amount_myr', 'amount'],
        'variation': ['variation'],
    },
    'lightspeed': {
        # Lightspeed Restaurant / Retail CSV export
        'item': ['product', 'product_name', 'item', 'description', 'item_name', 'menu_item'],
        'category': ['category', 'product_category', 'department', 'group'],
        'quantity': ['quantity', 'qty', 'quantity_sold', 'units_sold', 'count'],
        'gross_revenue': ['revenue', 'total_revenue', 'sales', 'total_sales', 'amount', 'total'],
        'cost': ['cost', 'cost_of_goods', 'cogs', 'total_cost', 'cost_price', 'unit_cost'],
        'gross_profit': ['gross_profit', 'profit', 'margin'],
        'date': ['date', 'sale_date', 'order_date', 'transaction_date', 'completed_at'],
        'sku': ['sku', 'product_sku', 'barcode', 'upc'],
        'supplier': ['supplier', 'vendor'],
    },
    'toast': {
        # Toast POS CSV export
        'item': ['menu_item', 'item', 'item_name', 'product'],
        'category': ['menu_group', 'category', 'menu_category', 'group'],
        'quantity': ['qty', 'quantity', 'count'],
        'gross_revenue': ['gross_amount', 'gross_sales', 'amount', 'total'],
        'net_revenue': ['net_amount', 'net_sales'],
        'discount': ['discount', 'discount_amount', 'promo'],
        'tax': ['tax', 'tax_amount'],
        'cost': ['cost', 'food_cost', 'cogs'],
        'date': ['date', 'order_date', 'business_date', 'opened'],
        'order_id': ['order_id', 'order_number', 'check_number'],
        'server': ['server', 'employee', 'staff'],
    },
    'clover': {
        # Clover POS CSV export
        'item': ['item_name', 'item', 'product_name', 'name'],
        'category': ['category', 'labels', 'item_group'],
        'quantity': ['quantity', 'qty', 'unit_qty'],
        'gross_revenue': ['total', 'amount', 'price', 'revenue', 'gross_sales'],
        'discount': ['discount', 'discounts'],
        'tax': ['tax', 'tax_amount'],
        'cost': ['cost', 'item_cost'],
        'date': ['date', 'created_time', 'order_date'],
        'order_id': ['order_id', 'order_number'],
    },
    'shopify': {
        # Shopify POS CSV export
        'item': ['lineitem_name', 'product', 'title', 'item', 'lineitem_sku'],
        'category': ['product_type', 'type', 'category', 'vendor'],
        'quantity': ['lineitem_quantity', 'quantity', 'qty'],
        'gross_revenue': ['total', 'subtotal', 'lineitem_price', 'amount'],
        'discount': ['discount_amount', 'discount_code', 'discounts'],
        'tax': ['tax', 'taxes', 'tax_amount'],
        'cost': ['lineitem_compare_at_price', 'cost', 'cogs'],
        'date': ['created_at', 'date', 'order_date', 'processed_at'],
        'order_id': ['name', 'order_number', 'order_id'],
    },
    'generic': {
        # Fallback — any custom CSV
        'item': ['item', 'product', 'item_name', 'product_name', 'menu_item', 'name', 'description',
                 'item_description', 'product_description', 'menu_name', 'item_title', 'line_item',
                 'sku_name', 'goods', 'service', 'food_item', 'drink', 'beverage'],
        'category': ['category', 'type', 'group', 'department', 'menu_group', 'product_type',
                     'item_category', 'item_group', 'item_type', 'class', 'sub_category',
                     'subcategory', 'product_group', 'section', 'family'],
        'quantity': ['quantity', 'qty', 'units_sold', 'count', 'unit_qty', 'num_sold',
                     'items_sold', 'units', 'sold', 'number_sold', 'quantity_sold', 'volume'],
        'price_per_unit': ['price', 'sale_price', 'selling_price', 'unit_price', 'price_each',
                           'unit_amount', 'each', 'retail_price', 'sell_price', 'price_inc',
                           'price_ex', 'price_incl', 'price_excl', 'item_price', 'unit_revenue',
                           'average_price', 'avg_price'],
        'gross_revenue': ['revenue', 'amount', 'total', 'gross_sales', 'net_sales', 'sales',
                          'total_sales', 'total_revenue', 'gross_revenue', 'net_revenue',
                          'total_amount', 'sale_amount', 'line_total', 'subtotal', 'sub_total',
                          'gross_amount', 'net_amount', 'turnover', 'income', 'total_inc',
                          'total_ex', 'total_incl', 'total_excl', 'value', 'sales_amount',
                          'extended_amount', 'ext_price', 'line_amount', 'total_price',
                          'sales_value', 'revenue_amount',
                          # Currency-suffixed amount columns (Amount_AUD, Amount_NZD, etc.)
                          'amount_aud', 'amount_nzd', 'amount_usd', 'amount_gbp',
                          'amount_eur', 'amount_cad', 'amount_jpy', 'amount_inr',
                          'amount_sgd', 'amount_hkd', 'amount_myr'],
        'cost': ['cost', 'cogs', 'cost_price', 'unit_cost', 'cost_of_goods', 'cost_each',
                 'purchase_price', 'buy_price', 'cost_amount', 'total_cost', 'item_cost',
                 'food_cost', 'ingredient_cost', 'material_cost', 'cost_per_unit'],
        'date': ['date', 'order_date', 'transaction_date', 'day', 'sale_date', 'created_at',
                 'sold_date', 'report_date', 'period', 'business_date', 'trans_date'],
    },
}


def detect_pos_format(headers):
    """Auto-detect which POS system exported this CSV based on column names."""
    h_lower = {h.strip().lower().replace(' ', '_') for h in headers}

    # Square Summary Report: has 'section' + ('name' or 'item_name') + amount column (Amount_AUD etc)
    if 'section' in h_lower and ('name' in h_lower or 'item_name' in h_lower):
        amount_cols = {c for c in h_lower if c.startswith('amount')}
        if amount_cols:
            return 'square_summary'

    # Square: has 'gross_sales' + 'net_sales' columns (very distinctive)
    if h_lower & {'gross_sales', 'net_sales'}:
        return 'square'

    # Toast: has 'menu_item' or 'menu_group' + ('gross_amount' or 'net_amount')
    if ('menu_item' in h_lower or 'menu_group' in h_lower) and h_lower & {'gross_amount', 'net_amount', 'business_date'}:
        return 'toast'

    # Shopify: has 'lineitem_name' or 'lineitem_quantity' (very distinctive)
    if h_lower & {'lineitem_name', 'lineitem_quantity', 'lineitem_price'}:
        return 'shopify'

    # Clover: has 'created_time' or 'unit_qty' or 'labels'
    if h_lower & {'created_time', 'unit_qty', 'labels'}:
        return 'clover'

    # Lightspeed: has 'product' or 'product_name' + 'cost_of_goods' or 'quantity_sold'
    if h_lower & {'cost_of_goods', 'quantity_sold', 'product_category'}:
        return 'lightspeed'
    if 'product' in h_lower and h_lower & {'revenue', 'total_revenue', 'gross_profit'}:
        return 'lightspeed'

    return 'generic'


def normalize_row(row, pos_format):
    """
    Normalize a POS row into our standard internal format:
    { item, category, quantity, revenue (total, not per-unit), cost (total), date }

    Key insight: Square/Lightspeed/Toast export TOTAL revenue per line
    (already multiplied by qty), while generic CSVs may have per-unit price.
    """
    col_map = POS_COLUMN_MAPS.get(pos_format, POS_COLUMN_MAPS['generic'])

    item = _flex_str(row, col_map.get('item', []))
    category = _flex_str(row, col_map.get('category', []))
    qty = _flex_num(row, col_map.get('quantity', [])) or 1
    date = _flex_str(row, col_map.get('date', []))

    # Square Summary: append variation to item name, category isn't in the data per-row
    if pos_format == 'square_summary':
        variation = _flex_str(row, col_map.get('variation', []))
        if variation:
            item = f"{item} ({variation})"
        # The 'Type' column is just "Item" for all item rows — not useful as category
        # Category info would need the Category Sales section; leave blank
        category = ''

    # --- Revenue calculation (handle POS-specific logic) ---
    gross_rev = _flex_num(row, col_map.get('gross_revenue', []))
    net_rev = _flex_num(row, col_map.get('net_revenue', []))
    discount = abs(_flex_num(row, col_map.get('discount', [])))
    per_unit_price = _flex_num(row, col_map.get('price_per_unit', []))

    if pos_format == 'square':
        # Square: Net Sales = Gross Sales - Discounts (already totals, use Net Sales)
        revenue = net_rev if net_rev else (gross_rev - discount)
    elif pos_format == 'square_summary':
        # Square Summary: Amount column is total revenue for the line
        revenue = gross_rev
    elif pos_format in ('toast', 'clover', 'shopify'):
        # These POS systems export total amounts per line
        revenue = net_rev if net_rev else (gross_rev - discount)
    elif pos_format == 'lightspeed':
        # Lightspeed exports total revenue per line
        revenue = gross_rev
    else:
        # Generic: check if there's a per-unit price OR a total revenue
        if per_unit_price > 0:
            revenue = per_unit_price * qty  # per-unit → multiply by qty
        elif gross_rev > 0:
            revenue = gross_rev  # already a total
        else:
            revenue = 0

    # --- Cost calculation ---
    cost_total = _flex_num(row, col_map.get('cost', []))
    gross_profit_val = _flex_num(row, col_map.get('gross_profit', []))

    if pos_format in ('square', 'square_summary', 'toast', 'clover', 'shopify', 'lightspeed'):
        # POS costs are typically total cost for the line
        if cost_total > 0:
            cost = cost_total
        elif gross_profit_val and revenue:
            # Lightspeed sometimes gives gross_profit instead of cost
            cost = revenue - gross_profit_val
        else:
            cost = 0
    else:
        # Generic: could be per-unit cost
        if per_unit_price > 0 and cost_total > 0 and cost_total < per_unit_price:
            # Likely per-unit cost (it's smaller than per-unit price)
            cost = cost_total * qty
        else:
            cost = cost_total if cost_total > 0 else 0

    # Ensure revenue is positive (some POS exports refunds as negative)
    if revenue < 0:
        revenue = 0
        cost = 0
        qty = 0

    # Normalize date format
    date = _normalize_date(date)

    return {
        'item': item,
        'category': category,
        'quantity': qty,
        'revenue': revenue,
        'cost': cost,
        'date': date,
    }


def _normalize_date(date_str):
    """Try to normalize various date formats to YYYY-MM-DD."""
    if not date_str:
        return ''

    # Already in YYYY-MM-DD
    if re.match(r'^\d{4}-\d{2}-\d{2}', date_str):
        return date_str[:10]

    # MM/DD/YYYY or M/D/YYYY (US format — Square, Toast)
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', date_str)
    if m:
        return f"{m.group(3)}-{m.group(1).zfill(2)}-{m.group(2).zfill(2)}"

    # DD/MM/YYYY (international)
    m = re.match(r'^(\d{1,2})-(\d{1,2})-(\d{4})', date_str)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"

    # ISO datetime: 2026-01-15T14:30:00
    m = re.match(r'^(\d{4}-\d{2}-\d{2})T', date_str)
    if m:
        return m.group(1)

    # Shopify-style: "2026-01-15 14:30:00 +0000"
    m = re.match(r'^(\d{4}-\d{2}-\d{2})\s', date_str)
    if m:
        return m.group(1)

    return date_str.strip()[:10]


# ─── Expense File Parsing ────────────────────────────────────────────────────

# Column name candidates for expense files
_EXPENSE_ITEM_COLS = ['item', 'name', 'item_name', 'product', 'product_name', 'description',
                      'expense', 'expense_name', 'ingredient', 'ingredient_name', 'material',
                      'category', 'type', 'account', 'line_item', 'menu_item']
_EXPENSE_COST_COLS = ['cost', 'amount', 'total', 'price', 'unit_cost', 'cost_price',
                      'expense_amount', 'value', 'total_cost', 'cost_amount', 'debit',
                      'amount_aud', 'amount_nzd', 'amount_usd', 'amount_gbp', 'amount_eur',
                      'amount_cad', 'subtotal', 'net_amount', 'gross_amount']
_EXPENSE_QTY_COLS = ['quantity', 'qty', 'units', 'count']
_EXPENSE_CAT_COLS = ['category', 'type', 'group', 'department', 'account', 'class',
                     'expense_category', 'expense_type', 'cost_centre', 'cost_center']


def parse_expense_data(expense_csv_text):
    """
    Parse an expense/cost file and return:
    - item_costs: dict mapping item name (lower) -> unit cost
    - category_costs: dict mapping category (lower) -> total cost
    - general_expenses: total of unmatched/overhead expenses
    - expense_rows: list of parsed {name, category, cost, quantity} dicts
    """
    rows, _, headers = parse_csv_text(expense_csv_text)
    if not rows:
        return {}, {}, 0, []

    expense_rows = []
    for row in rows:
        name = _flex_str(row, _EXPENSE_ITEM_COLS)
        cost = _flex_num(row, _EXPENSE_COST_COLS)
        qty = _flex_num(row, _EXPENSE_QTY_COLS) or 1
        cat = _flex_str(row, _EXPENSE_CAT_COLS)

        if cost <= 0:
            continue

        expense_rows.append({
            'name': name,
            'category': cat,
            'cost': abs(cost),
            'quantity': qty,
        })

    # Build item-level cost lookup (unit cost = total / qty)
    item_costs = {}
    category_costs = {}
    general_expenses = 0

    for er in expense_rows:
        name_key = er['name'].lower().strip()
        cat_key = er['category'].lower().strip()

        if name_key:
            # Per-item cost: store as unit cost
            if name_key not in item_costs:
                item_costs[name_key] = {'total_cost': 0, 'total_qty': 0}
            item_costs[name_key]['total_cost'] += er['cost']
            item_costs[name_key]['total_qty'] += er['quantity']
        elif cat_key:
            # Category-level expense
            category_costs[cat_key] = category_costs.get(cat_key, 0) + er['cost']
        else:
            # General overhead
            general_expenses += er['cost']

    # Convert to unit costs
    unit_costs = {}
    for name_key, data in item_costs.items():
        if data['total_qty'] > 0:
            unit_costs[name_key] = data['total_cost'] / data['total_qty']
        else:
            unit_costs[name_key] = data['total_cost']

    return unit_costs, category_costs, general_expenses, expense_rows


def apply_expense_data(normalized_rows, unit_costs, category_costs):
    """
    Merge expense file costs into normalized sales rows.
    Only applies to rows that have zero cost (i.e. POS didn't provide it).
    Returns (updated_rows, matched_count).
    """
    matched = 0
    for r in normalized_rows:
        if r['cost'] > 0:
            continue  # Already has cost from sales data — don't override

        item_key = r['item'].lower().strip()
        cat_key = r['category'].lower().strip()
        qty = r['quantity'] or 1

        # Try exact item name match
        if item_key in unit_costs:
            r['cost'] = _r(unit_costs[item_key] * qty)
            matched += 1
            continue

        # Try partial match (expense item name is contained in sales item name or vice versa)
        for exp_key, uc in unit_costs.items():
            if exp_key in item_key or item_key in exp_key:
                r['cost'] = _r(uc * qty)
                matched += 1
                break
        else:
            # Try category-level cost: distribute proportionally by revenue within category
            # (handled after all rows are processed below)
            pass

    return normalized_rows, matched


# ─── Financial Engine ────────────────────────────────────────────────────────

def compute_metrics(normalized_rows, fixed_costs=0):
    """
    Compute cafe financial metrics from normalized rows.
    Each row: { item, category, quantity, revenue (total), cost (total), date }
    """
    total_revenue = 0
    total_cogs = 0
    total_units = 0
    items = {}
    categories = {}
    daily = {}

    for r in normalized_rows:
        rev = r['revenue']
        cog = r['cost']
        qty = r['quantity']
        item = r['item']
        cat = r['category']
        date = r['date']
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


# ─── Groq AI ───────────────────────────────────────────────────────────

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
                    'You are a friendly, experienced cafe business advisor having a conversation '
                    'with a cafe owner. Write in a warm, approachable tone — like a mentor giving advice over coffee. '
                    'Use plain language, avoid jargon. Be specific with numbers from the data. '
                    'Structure your response with these exact emoji headers on their own line:\n'
                    '🔥 Quick Wins\n💰 Pricing Tips\n📋 Menu Moves\n✂️ Cut Costs\n📈 Grow Revenue\n💡 Pro Tip\n'
                    'Under each header, write 2-3 short conversational paragraphs (not bullet lists). '
                    'Start each section with the most impactful advice. Keep it practical and encouraging. '
                    'End with a single motivating sentence.'
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
            'User-Agent': 'AI-Cafe-Analyst/2.0',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            return data['choices'][0]['message']['content']
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ''
        return f'AI analysis unavailable: {e} — {error_body}'
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

Give me friendly, practical advice using the emoji section headers (🔥 Quick Wins, 💰 Pricing Tips, 📋 Menu Moves, ✂️ Cut Costs, 📈 Grow Revenue, 💡 Pro Tip). Write short paragraphs, not bullet lists. Be specific with dollar amounts and percentages from the data. Keep it encouraging and actionable."""


# ─── Helpers ──────────────────────────────────────────────────────────────────

# Common currency suffixes for flexible column matching
_CURRENCY_SUFFIXES = (
    '_aud', '_nzd', '_usd', '_gbp', '_eur', '_cad', '_jpy', '_inr',
    '_sgd', '_hkd', '_myr', '_chf', '_sek', '_nok', '_dkk', '_krw',
    '_thb', '_php', '_idr', '_vnd', '_zar', '_brl', '_mxn', '_clp',
)


def _flex_num(row, key_options):
    """Extract a numeric value from a row, trying multiple possible column names.
    Also handles currency-suffixed variants (e.g. amount_aud matches 'amount')."""
    for k in key_options:
        for rk in row:
            rk_norm = rk.strip().lower().replace(' ', '_')
            if rk_norm == k:
                v = _parse_num(row[rk])
                if v is not None:
                    return v
    # Fallback: try stripping currency suffix from column names
    for k in key_options:
        for rk in row:
            rk_norm = rk.strip().lower().replace(' ', '_')
            for sfx in _CURRENCY_SUFFIXES:
                if rk_norm == k + sfx or (rk_norm.endswith(sfx) and rk_norm[:-len(sfx)] == k):
                    v = _parse_num(row[rk])
                    if v is not None:
                        return v
    return 0


def _parse_num(raw):
    """Parse a raw cell value into a float, or return None."""
    try:
        val = str(raw).strip()
        val = val.replace('$', '').replace(',', '').replace('(', '-').replace(')', '')
        val = val.strip()
        if not val or val.lower() in ('nan', 'n/a', '', '-', '--'):
            return None
        return float(val)
    except (ValueError, TypeError):
        return None


def _flex_str(row, key_options):
    """Extract a string value from a row, trying multiple possible column names."""
    for k in key_options:
        for rk in row:
            if rk.strip().lower().replace(' ', '_') == k:
                v = str(row[rk]).strip()
                if v and v.lower() not in ('nan', 'n/a', 'none', ''):
                    return v
    return ''


def _r(n):
    return round(n, 2)


def parse_csv_text(text):
    """
    Parse CSV text into list of dicts using Python's csv module.
    Handles quoted fields with commas, various delimiters, BOM, etc.
    """
    # Strip BOM if present
    if text.startswith('\ufeff'):
        text = text[1:]

    text = text.strip()
    if not text:
        return [], 'generic'

    # Detect delimiter (tab vs comma)
    first_line = text.split('\n')[0]
    dialect = 'excel'
    delimiter = ','
    if first_line.count('\t') > first_line.count(','):
        delimiter = '\t'

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)

    rows = []
    headers = []
    for row in reader:
        if not headers:
            headers = list(row.keys())
        # Skip completely empty rows
        if any(v and v.strip() for v in row.values()):
            rows.append(row)

    # Detect POS format from headers
    pos_format = detect_pos_format(headers) if headers else 'generic'

    # Square Summary Report: filter to "Item Sales" rows only (avoid double-counting)
    if pos_format == 'square_summary':
        rows = _filter_square_summary(rows)

    return rows, pos_format, headers


def _filter_square_summary(rows):
    """
    Square Summary CSVs have sections: Summary, Payments, Category Sales, Item Sales.
    Keep only 'Item Sales' rows to get item-level detail.
    If no 'Item Sales' rows, fall back to 'Category Sales'.
    """
    # Find the section column key (case-insensitive)
    section_key = None
    if rows:
        for k in rows[0]:
            if k.strip().lower() == 'section':
                section_key = k
                break
    if not section_key:
        return rows

    item_rows = [r for r in rows if r.get(section_key, '').strip().lower() == 'item sales']
    if item_rows:
        return item_rows

    cat_rows = [r for r in rows if r.get(section_key, '').strip().lower() == 'category sales']
    if cat_rows:
        return cat_rows

    return rows


# ─── HTTP Handler ─────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self._cors(204)

    def do_GET(self):
        path = self.path.split('?')[0].rstrip('/')

        if path in ('', '/api', '/api/'):
            self._json(200, {
                'name': 'AI Cafe Analyst',
                'version': '2.0.0',
                'status': 'online',
                'ai_enabled': bool(GROQ_API_KEY),
                'ai_model': GROQ_MODEL if GROQ_API_KEY else None,
                'supported_pos': ['square', 'square_summary', 'lightspeed', 'toast', 'clover', 'shopify', 'generic'],
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
                force_format = body.get('pos_format', '')  # optional override
                expense_csv_text = body.get('expense_csv', '')

                # Parse CSV if provided as text
                pos_format = 'generic'
                csv_headers = []
                if csv_text and not rows:
                    rows, pos_format, csv_headers = parse_csv_text(csv_text)

                # Allow client to override detected format
                if force_format and force_format in POS_COLUMN_MAPS:
                    pos_format = force_format

                if not rows:
                    self._json(400, {'error': 'No data provided. Send "csv" (CSV text) or "rows" (array of objects).'})
                    return

                # Normalize all rows to standard internal format
                normalized = [normalize_row(r, pos_format) for r in rows]
                # Filter out empty rows (no item and no revenue)
                normalized = [r for r in normalized if r['item'] or r['revenue'] > 0]

                if not normalized:
                    self._json(400, {
                        'error': f'Could not extract data from your CSV. Detected format: {pos_format}. '
                                 f'Make sure your CSV has columns for item names and sales amounts. '
                                 f'Supported POS systems: Square, Lightspeed, Toast, Clover, Shopify.'
                    })
                    return

                # Parse and apply expense file if provided
                expense_matched = 0
                expense_general = 0
                if expense_csv_text:
                    unit_costs, category_costs, general_expenses, expense_rows = parse_expense_data(expense_csv_text)
                    normalized, expense_matched = apply_expense_data(normalized, unit_costs, category_costs)
                    # Add general/unmatched expenses to fixed costs
                    expense_general = general_expenses
                    # Add category-level costs that couldn't be matched per-item as general expenses
                    for cat_key, cat_cost in category_costs.items():
                        # Check if any rows matched this category
                        cat_items = [r for r in normalized if r['category'].lower().strip() == cat_key]
                        if cat_items:
                            # Distribute category cost proportionally by revenue
                            total_cat_rev = sum(r['revenue'] for r in cat_items) or 1
                            for r in cat_items:
                                if r['cost'] <= 0:
                                    r['cost'] = _r(cat_cost * (r['revenue'] / total_cat_rev))
                                    expense_matched += 1
                        else:
                            expense_general += cat_cost
                    fixed_costs += expense_general

                # Compute metrics
                metrics = compute_metrics(normalized, fixed_costs)

                # Get AI recommendations
                prompt = build_prompt(metrics)
                ai_text = call_groq(prompt)

                result = {
                    'metrics': metrics,
                    'ai_recommendations': ai_text or 'Set GROQ_API_KEY environment variable for free AI recommendations (get key at console.groq.com).',
                    'ai_enabled': bool(GROQ_API_KEY),
                    'analyzed_at': datetime.utcnow().isoformat(),
                    'rows_processed': len(normalized),
                    'pos_format_detected': pos_format,
                    'csv_headers': csv_headers,
                    'expense_file_used': bool(expense_csv_text),
                    'expense_items_matched': expense_matched,
                    'expense_general_added': _r(expense_general) if expense_csv_text else 0,
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
