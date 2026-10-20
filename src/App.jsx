import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, syncWithCloud, deleteTransaction, restoreTransaction } from './lib/db';
import { Plus, Wifi, WifiOff, Trash2, Pencil, X, Search, Download, Undo2, Minus } from 'lucide-react';
import './App.css';

const CATEGORIES = [
  { name: 'Food & Snacks', color: '#b4532a' },
  { name: 'Data & Airtime', color: '#2f5d7c' },
  { name: 'Transport', color: '#c79a2e' },
  { name: 'Academics & Printing', color: '#5b6b3a' },
  { name: 'Hostel & Utilities', color: '#7a4b62' },
  { name: 'Other', color: '#6b6a64' },
];
const colorOf = (name) => CATEGORIES.find((c) => c.name === name)?.color || '#6b6a64';

const money = (n) =>
  'GH\u20B5 ' + Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dayKey = (d) => new Date(d).toLocaleDateString('en-CA');
const todayKey = () => dayKey(new Date());

const dayLabel = (key) => {
  const t = todayKey();
  const y = dayKey(new Date(Date.now() - 86400000));
  if (key === t) return 'Today';
  if (key === y) return 'Yesterday';
  return new Date(key + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

const emptyItem = () => ({ name: '', qty: 1, unitPrice: '' });

function readBudget() {
  try {
    return Number(localStorage.getItem('campus_budget')) || 0;
  } catch {
    return 0;
  }
}

export default function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // sheet / form state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0].name);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayKey());
  const [items, setItems] = useState([emptyItem()]);

  // list controls
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [range, setRange] = useState(7);

  // budget + toast
  const [budget, setBudget] = useState(readBudget);
  const [editingBudget, setEditingBudget] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const lastDeleted = useRef(null);

  const transactions = useLiveQuery(() => db.transactions.orderBy('created_at').reverse().toArray(), []) || [];

  /* ---------- derived numbers ---------- */
  const { balance, monthSpent, monthIncome, unsynced } = useMemo(() => {
    const now = new Date();
    let inc = 0, exp = 0, mInc = 0, mExp = 0, un = 0;
    for (const t of transactions) {
      const amt = Number(t.amount);
      const d = new Date(t.created_at);
      const sameMonth = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (t.type === 'income') { inc += amt; if (sameMonth) mInc += amt; }
      else { exp += amt; if (sameMonth) mExp += amt; }
      if (t.synced === 0) un++;
    }
    return { balance: inc - exp, monthSpent: mExp, monthIncome: mInc, unsynced: un };
  }, [transactions]);

  const daily = useMemo(() => {
    const map = {};
    for (const t of transactions) {
      if (t.type !== 'expense') continue;
      const k = dayKey(t.created_at);
      map[k] = (map[k] || 0) + Number(t.amount);
    }
    const out = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = dayKey(d);
      out.push({ key: k, date: d, value: map[k] || 0 });
    }
    return out;
  }, [transactions, range]);

  const byCategory = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (range - 1));
    cutoff.setHours(0, 0, 0, 0);
    const map = {};
    for (const t of transactions) {
      if (t.type !== 'expense' || new Date(t.created_at) < cutoff) continue;
      map[t.category] = (map[t.category] || 0) + Number(t.amount);
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, color: colorOf(name) }))
      .sort((a, b) => b.value - a.value);
  }, [transactions, range]);

  const rangeTotal = daily.reduce((s, d) => s + d.value, 0);
  const avgPerDay = rangeTotal / range;
  const peakDay = daily.reduce((m, d) => (d.value > m.value ? d : m), daily[0] || { value: 0 });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (catFilter !== 'all' && t.category !== catFilter) return false;
      if (!q) return true;
      const hay = [t.category, t.note, ...(t.items || []).map((i) => i.name)].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [transactions, query, typeFilter, catFilter]);

  const grouped = useMemo(() => {
    const g = [];
    for (const t of filtered) {
      const k = dayKey(t.created_at);
      const last = g[g.length - 1];
      if (last && last.key === k) last.rows.push(t);
      else g.push({ key: k, rows: [t] });
    }
    return g;
  }, [filtered]);

  /* ---------- effects ---------- */
  useEffect(() => {
    if (navigator.onLine) syncWithCloud();
    const on = () => { setIsOnline(true); syncWithCloud(); };
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = sheetOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sheetOpen]);

  /* ---------- helpers ---------- */
  const flash = (msg, undo) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, undo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const openNew = (t = 'expense') => {
    setEditing(null);
    setType(t);
    setAmount('');
    setCategory(CATEGORIES[0].name);
    setNote('');
    setDate(todayKey());
    setItems([emptyItem()]);
    setSheetOpen(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setType(t.type);
    setAmount(String(t.amount));
    setCategory(t.category);
    setNote(t.note || '');
    setDate(dayKey(t.created_at));
    setItems(t.items && t.items.length ? t.items.map((i) => ({ ...i })) : [emptyItem()]);
    setSheetOpen(true);
  };

  const closeSheet = () => setSheetOpen(false);

  const changeItem = (idx, field, value) => {
    const next = items.map((it, i) => (i === idx ? { ...it, [field]: value } : it));
    setItems(next);
    const total = next.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
    if (total > 0) setAmount(String(Math.round(total * 100) / 100));
  };

  const removeItem = (idx) => {
    const next = items.filter((_, i) => i !== idx);
    setItems(next.length ? next : [emptyItem()]);
  };

  const buildTimestamp = () => {
    if (date === todayKey() && !editing) return new Date().toISOString();
    if (editing && date === dayKey(editing.created_at)) return editing.created_at;
    return new Date(date + 'T12:00:00').toISOString();
  };

  const save = async (e) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return flash('Enter an amount greater than zero');

    const cleanItems =
      type === 'expense'
        ? items
            .filter((i) => i.name.trim())
            .map((i) => ({ name: i.name.trim(), qty: Number(i.qty) || 1, unitPrice: Number(i.unitPrice) || 0 }))
        : [];

    const payload = { type, amount: amt, category, items: cleanItems, note: note.trim(), created_at: buildTimestamp(), synced: 0 };

    if (editing) await db.transactions.update(editing.id, payload);
    else await db.transactions.add({ id: crypto.randomUUID(), ...payload });

    closeSheet();
    flash(editing ? 'Changes saved' : type === 'income' ? 'Money added' : 'Expense recorded');
    syncWithCloud();
  };

  const remove = async (t) => {
    lastDeleted.current = t;
    await deleteTransaction(t);
    flash('Transaction deleted', async () => {
      await restoreTransaction(lastDeleted.current);
      setToast(null);
    });
  };

  const saveBudget = (v) => {
    const n = Math.max(0, Number(v) || 0);
    setBudget(n);
    try { localStorage.setItem('campus_budget', String(n)); } catch { /* storage unavailable */ }
    setEditingBudget(false);
  };

  const exportCsv = () => {
    const rows = [['Date', 'Type', 'Category', 'Amount', 'Items', 'Note']];
    for (const t of transactions) {
      rows.push([
        dayKey(t.created_at),
        t.type,
        t.category,
        Number(t.amount).toFixed(2),
        (t.items || []).map((i) => `${i.qty}x ${i.name}`).join('; '),
        t.note || '',
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `campus-ledger-${todayKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onTilt = (e) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${x * 12}deg`);
    el.style.setProperty('--rx', `${-y * 10}deg`);
    el.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
    el.style.setProperty('--gy', `${(y + 0.5) * 100}%`);
  };
  const resetTilt = (e) => {
    const el = e.currentTarget;
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--rx', '0deg');
  };

  const budgetPct = budget > 0 ? Math.min(100, (monthSpent / budget) * 100) : 0;
  const overBudget = budget > 0 && monthSpent > budget;

  /* ---------- render ---------- */
  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Campus Ledger</p>
          <h1 className="title">Your money, this semester</h1>
        </div>
        <div className={`status ${isOnline ? 'is-on' : 'is-off'}`}>
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>{isOnline ? (unsynced > 0 ? 'Syncing' : 'Cloud synced') : 'Offline'}</span>
          {unsynced > 0 && <span className="status-count">{unsynced} pending</span>}
        </div>
      </header>

      {/* Balance card */}
      <section className="stage">
        <div className="balance" onPointerMove={onTilt} onPointerLeave={resetTilt}>
          <div className="balance-glow" />
          <div className="balance-layer balance-top">
            <span className="label">Available funds</span>
          </div>
          <div className="balance-layer balance-main">
            <span className="amount">{money(balance)}</span>
          </div>
          <div className="balance-layer balance-foot">
            <div>
              <span className="label">In this month</span>
              <strong>{money(monthIncome)}</strong>
            </div>
            <div>
              <span className="label">Out this month</span>
              <strong>{money(monthSpent)}</strong>
            </div>
          </div>
        </div>
      </section>

      <div className="actions">
        <button className="btn btn-primary" onClick={() => openNew('expense')}>
          <Minus size={16} /> Record expense
        </button>
        <button className="btn btn-ghost" onClick={() => openNew('income')}>
          <Plus size={16} /> Add money
        </button>
      </div>

      {/* Budget */}
      <section className="panel">
        <div className="panel-head">
          <h3>Monthly budget</h3>
          {editingBudget ? (
            <form
              className="inline-form"
              onSubmit={(e) => { e.preventDefault(); saveBudget(e.target.elements.b.value); }}
            >
              <input name="b" type="number" min="0" step="1" defaultValue={budget || ''} autoFocus placeholder="0" />
              <button className="link" type="submit">Save</button>
            </form>
          ) : (
            <button className="link" onClick={() => setEditingBudget(true)}>
              {budget > 0 ? 'Change' : 'Set budget'}
            </button>
          )}
        </div>
        {budget > 0 ? (
          <>
            <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(budgetPct)}>
              <div className={`meter-fill ${overBudget ? 'over' : ''}`} style={{ width: `${budgetPct}%` }} />
            </div>
            <p className="meter-note">
              {overBudget
                ? `${money(monthSpent - budget)} over your ${money(budget)} budget`
                : `${money(budget - monthSpent)} left of ${money(budget)}`}
            </p>
          </>
        ) : (
          <p className="meter-note muted">Set a monthly limit to see how much room you have left.</p>
        )}
      </section>

      {/* Insights */}
      <section className="panel">
        <div className="panel-head">
          <h3>Spending</h3>
          <div className="seg">
            {[7, 30].map((r) => (
              <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
                {r} days
              </button>
            ))}
          </div>
        </div>

        <div className="kpis">
          <div><span className="label">Total</span><strong>{money(rangeTotal)}</strong></div>
          <div><span className="label">Daily average</span><strong>{money(avgPerDay)}</strong></div>
          <div>
            <span className="label">Highest day</span>
            <strong>{peakDay.value > 0 ? money(peakDay.value) : '--'}</strong>
          </div>
        </div>

        <BarChart data={daily} range={range} />

        <h4 className="sub">By category</h4>
        {byCategory.length === 0 ? (
          <p className="muted small">No spending in this period.</p>
        ) : (
          <div className="donut-wrap">
            <Donut data={byCategory} total={rangeTotal} />
            <ul className="legend">
              {byCategory.map((c) => (
                <li key={c.name}>
                  <i style={{ background: c.color }} />
                  <span>{c.name}</span>
                  <b>{Math.round((c.value / rangeTotal) * 100)}%</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* History */}
      <section className="panel">
        <div className="panel-head">
          <h3>History</h3>
          <button className="link icon-link" onClick={exportCsv} disabled={!transactions.length}>
            <Download size={14} /> Export CSV
          </button>
        </div>

        <div className="search">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items, notes, categories" />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>
          )}
        </div>

        <div className="filters">
          <div className="seg">
            {[['all', 'All'], ['expense', 'Spent'], ['income', 'Received']].map(([v, l]) => (
              <button key={v} className={typeFilter === v ? 'on' : ''} onClick={() => setTypeFilter(v)}>{l}</button>
            ))}
          </div>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => <option key={c.name}>{c.name}</option>)}
          </select>
        </div>

        {grouped.length === 0 ? (
          <p className="empty">{transactions.length === 0 ? 'Nothing recorded yet. Add your first transaction above.' : 'No transactions match those filters.'}</p>
        ) : (
          grouped.map((g) => (
            <div key={g.key} className="day">
              <h5>{dayLabel(g.key)}</h5>
              {g.rows.map((t, i) => (
                <article key={t.id} className="tx" style={{ '--i': i }}>
                  <span className="dot" style={{ background: colorOf(t.category) }} />
                  <div className="tx-body">
                    <strong>{t.category}</strong>
                    <p>
                      {t.items?.length > 0 ? t.items.map((x) => `${x.qty} x ${x.name}`).join(', ') : t.note || (t.type === 'income' ? 'Money added' : 'Expense')}
                    </p>
                    {t.items?.length > 0 && t.note && <p className="tx-note">{t.note}</p>}
                  </div>
                  <div className="tx-side">
                    <span className={`tx-amt ${t.type}`}>
                      {t.type === 'income' ? '+' : '-'} {money(t.amount)}
                    </span>
                    <span className={`sync ${t.synced ? 'ok' : 'wait'}`}>{t.synced ? 'Synced' : 'Waiting to sync'}</span>
                  </div>
                  <div className="tx-tools">
                    <button aria-label="Edit transaction" onClick={() => openEdit(t)}><Pencil size={15} /></button>
                    <button aria-label="Delete transaction" className="danger" onClick={() => remove(t)}><Trash2 size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
          ))
        )}
      </section>

      {/* Bottom sheet form */}
      {sheetOpen && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && closeSheet()}>
          <form className="sheet" onSubmit={save}>
            <div className="sheet-head">
              <h3>{editing ? 'Edit transaction' : type === 'expense' ? 'Record expense' : 'Add money'}</h3>
              <button type="button" aria-label="Close" onClick={closeSheet}><X size={18} /></button>
            </div>

            <div className="seg seg-wide">
              <button type="button" className={type === 'expense' ? 'on exp' : ''} onClick={() => setType('expense')}>Expense</button>
              <button type="button" className={type === 'income' ? 'on inc' : ''} onClick={() => setType('income')}>Add money</button>
            </div>

            {type === 'expense' && (
              <div className="field">
                <label>Items bought</label>
                {items.map((it, idx) => (
                  <div key={idx} className="item-row">
                    <input
                      className="grow"
                      placeholder="Waakye, pen, bus fare"
                      value={it.name}
                      onChange={(e) => changeItem(idx, 'name', e.target.value)}
                    />
                    <input
                      className="qty"
                      type="number"
                      min="1"
                      aria-label="Quantity"
                      value={it.qty}
                      onChange={(e) => changeItem(idx, 'qty', e.target.value)}
                    />
                    <input
                      className="price"
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label="Unit price"
                      placeholder="Price"
                      value={it.unitPrice}
                      onChange={(e) => changeItem(idx, 'unitPrice', e.target.value)}
                    />
                    <button type="button" className="rm" aria-label="Remove item" onClick={() => removeItem(idx)}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button type="button" className="link" onClick={() => setItems([...items, emptyItem()])}>
                  Add another item
                </button>
              </div>
            )}

            <div className="field">
              <label htmlFor="amt">Total amount (GH{'\u20B5'})</label>
              <input id="amt" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="cat">Category</label>
                <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c.name}>{c.name}</option>)}
                  {!CATEGORIES.some((c) => c.name === category) && <option>{category}</option>}
                </select>
              </div>
              <div className="field">
                <label htmlFor="dt">Date</label>
                <input id="dt" type="date" max={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="nt">Note (optional)</label>
              <input id="nt" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering" />
            </div>

            <button className="btn btn-primary btn-block" type="submit">
              {editing ? 'Save changes' : type === 'expense' ? 'Deduct and record' : 'Add to balance'}
            </button>
          </form>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.msg}</span>
          {toast.undo && (
            <button onClick={toast.undo}><Undo2 size={14} /> Undo</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- charts (plain SVG, no extra dependency) ---------- */

function BarChart({ data, range }) {
  const W = 320, H = 150, padX = 6, padTop = 10, padBottom = 22;
  const max = Math.max(...data.map((d) => d.value), 1);
  const slot = (W - padX * 2) / data.length;
  const bw = Math.max(3, slot * (range > 7 ? 0.6 : 0.5));
  const chartH = H - padTop - padBottom;

  return (
    <svg className="bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily spending for the last ${range} days`}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={padX} x2={W - padX} y1={padTop + chartH * (1 - f)} y2={padTop + chartH * (1 - f)} className="grid" />
      ))}
      {data.map((d, i) => {
        const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * chartH);
        const x = padX + i * slot + (slot - bw) / 2;
        const y = padTop + chartH - h;
        const isToday = i === data.length - 1;
        const showLabel = range === 7 || i % 5 === 0 || isToday;
        return (
          <g key={d.key}>
            <rect
              className={`bar ${isToday ? 'today' : ''}`}
              x={x}
              y={y}
              width={bw}
              height={h}
              rx={Math.min(4, bw / 2)}
              style={{ '--d': `${i * (range > 7 ? 18 : 55)}ms` }}
            >
              <title>{`${d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: ${money(d.value)}`}</title>
            </rect>
            {showLabel && (
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="tick">
                {range === 7 ? d.date.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2) : d.date.getDate()}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Donut({ data, total }) {
  const r = 46;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg className="donut" viewBox="0 0 120 120" role="img" aria-label="Spending by category">
      <circle cx="60" cy="60" r={r} className="donut-track" />
      <g transform="rotate(-90 60 60)">
        {data.map((d, i) => {
          const len = (d.value / total) * C;
          const el = (
            <circle
              key={d.name}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth="14"
              strokeDasharray={`${Math.max(len - 1.5, 0.5)} ${C - Math.max(len - 1.5, 0.5)}`}
              strokeDashoffset={-offset}
              className="seg-arc"
              style={{ '--d': `${i * 90}ms` }}
            >
              <title>{`${d.name}: ${money(d.value)}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      </g>
      <text x="60" y="56" textAnchor="middle" className="donut-k">Spent</text>
      <text x="60" y="72" textAnchor="middle" className="donut-v">
        {total >= 1000 ? (total / 1000).toFixed(1) + 'k' : Math.round(total)}
      </text>
    </svg>
  );
}