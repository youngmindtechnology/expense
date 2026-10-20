import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, syncWithCloud, deleteTrip, settleTrip } from './lib/db';
import { Plus, X, ChevronRight } from 'lucide-react';
import './Trips.css';

const spentOf = (trip) => (trip.expenses || []).reduce((s, e) => s + Number(e.amount), 0);
const plain = (n) => Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Trips({ categories, money, balance, flash }) {
  const trips = useLiveQuery(() => db.trips.orderBy('created_at').reverse().toArray(), []) || [];
  const active = trips.filter((t) => t.status === 'active');
  const done = trips.filter((t) => t.status === 'settled').slice(0, 3);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBudget, setNewBudget] = useState('');
  const [openId, setOpenId] = useState(null);

  const openTrip = active.find((t) => t.id === openId);

  const create = async (e) => {
    e.preventDefault();
    const b = Number(newBudget);
    if (!newName.trim() || !b || b <= 0) return flash('Give the goal a name and a target amount');
    const id = crypto.randomUUID();
    await db.trips.add({
      id,
      name: newName.trim(),
      budget: b,
      status: 'active',
      expenses: [],
      created_at: new Date().toISOString(),
      settled_at: null,
      synced: 0
    });
    setCreating(false);
    setNewName('');
    setNewBudget('');
    setOpenId(id);
    syncWithCloud();
  };

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h3>Spending goals</h3>
          <button className="link icon-link" onClick={() => setCreating(true)}>
            <Plus size={14} /> New goal
          </button>
        </div>

        {active.length === 0 ? (
          <p className="muted small">
            Going out to buy something? Set a target, track what you spend against it, and deduct the total from your balance when you are done.
          </p>
        ) : (
          <div className="goal-list">
            {active.map((t, i) => {
              const spent = spentOf(t);
              const left = t.budget - spent;
              const over = left < 0;
              const pct = Math.min(100, (spent / t.budget) * 100);
              return (
                <button key={t.id} className="goal" style={{ '--i': i }} onClick={() => setOpenId(t.id)}>
                  <div className="goal-top">
                    <strong>{t.name}</strong>
                    <span>{money(t.budget)} <ChevronRight size={14} /></span>
                  </div>
                  <div className="meter">
                    <div className={`meter-fill ${over ? 'over' : ''}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="goal-foot">
                    <span>Spent <b>{money(spent)}</b></span>
                    <span className={over ? 'over' : ''}>{over ? `${money(-left)} over` : `${money(left)} left`}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {done.length > 0 && (
          <>
            <h4 className="sub">Recently finished</h4>
            {done.map((t) => (
              <div key={t.id} className="done">
                <span>
                  {t.name}
                  <em>{new Date(t.settled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</em>
                </span>
                <b>{money(spentOf(t))} of {money(t.budget)}</b>
              </div>
            ))}
          </>
        )}
      </section>

      {creating && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setCreating(false)}>
          <form className="sheet" onSubmit={create}>
            <div className="sheet-head">
              <h3>New spending goal</h3>
              <button type="button" aria-label="Close" onClick={() => setCreating(false)}><X size={18} /></button>
            </div>
            <p className="hint">
              Pick an amount for an outing or a purchase. What you spend on it stays separate from your balance until you finish the goal.
            </p>
            <div className="field">
              <label htmlFor="gn">Goal name</label>
              <input id="gn" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Market trip, new shoes" autoFocus />
            </div>
            <div className="field">
              <label htmlFor="gb">Target amount (GH{'\u20B5'})</label>
              <input id="gb" type="number" min="0" step="0.01" inputMode="decimal" value={newBudget} onChange={(e) => setNewBudget(e.target.value)} placeholder="200" />
              {Number(newBudget) > balance && (
                <p className="warn">This is more than your available balance of {money(balance)}.</p>
              )}
            </div>
            <button className="btn btn-primary btn-block" type="submit">Create goal</button>
          </form>
        </div>
      )}

      {openTrip && (
        <TripSheet
          key={openTrip.id}
          trip={openTrip}
          categories={categories}
          money={money}
          balance={balance}
          flash={flash}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

function TripSheet({ trip, categories, money, balance, flash, onClose }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState(categories[0].name);
  const [confirming, setConfirming] = useState(false);
  const [armDiscard, setArmDiscard] = useState(false);
  const [editTarget, setEditTarget] = useState(false);
  const nameRef = useRef(null);

  const expenses = trip.expenses || [];
  const spent = spentOf(trip);
  const left = trip.budget - spent;
  const over = left < 0;
  const pct = trip.budget > 0 ? Math.min(100, (spent / trip.budget) * 100) : 0;
  const C = 2 * Math.PI * 50;
  const line = (Number(qty) || 0) * (Number(price) || 0);

  const save = async (changes) => {
    await db.trips.update(trip.id, { ...changes, synced: 0 });
    syncWithCloud();
  };

  const addExpense = async (e) => {
    e.preventDefault();
    const q = Number(qty) || 1;
    const p = Number(price);
    if (!name.trim() || !p || p <= 0) return flash('Enter the item and its price');
    const exp = {
      id: crypto.randomUUID(),
      name: name.trim(),
      qty: q,
      unitPrice: p,
      amount: Math.round(q * p * 100) / 100,
      category
    };
    await save({ expenses: [...expenses, exp] });
    setName('');
    setQty(1);
    setPrice('');
    nameRef.current?.focus();
  };

  const removeExpense = (id) => save({ expenses: expenses.filter((x) => x.id !== id) });

  const changeTarget = async (e) => {
    e.preventDefault();
    const n = Number(e.target.elements.t.value);
    if (!n || n <= 0) return flash('Enter a target above zero');
    await save({ budget: n });
    setEditTarget(false);
  };

  const finish = async () => {
    await settleTrip(trip);
    flash(spent > 0 ? `${money(spent)} deducted from your balance` : 'Goal closed');
    onClose();
  };

  const discard = async () => {
    if (!armDiscard) return setArmDiscard(true);
    await deleteTrip(trip);
    flash('Goal discarded, nothing was deducted');
    onClose();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="sheet-head">
          <h3>{trip.name}</h3>
          <button type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>

        <svg className="ring" viewBox="0 0 120 120" role="img" aria-label={`${plain(Math.abs(left))} ${over ? 'over' : 'left'}`}>
          <circle cx="60" cy="60" r="50" className="ring-track" />
          <g transform="rotate(-90 60 60)">
            <circle
              cx="60" cy="60" r="50"
              className={`ring-fill ${over ? 'over' : ''}`}
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct / 100)}
            />
          </g>
          <text x="60" y="54" textAnchor="middle" className="ring-k">{over ? 'Over by' : 'Left'}</text>
          <text x="60" y="71" textAnchor="middle" className="ring-v">{plain(Math.abs(left))}</text>
        </svg>

        <p className="ring-note">
          Spent {money(spent)} of{' '}
          {editTarget ? (
            <form className="inline-form" onSubmit={changeTarget}>
              <input name="t" type="number" min="0" step="0.01" defaultValue={trip.budget} autoFocus />
              <button className="link" type="submit">Save</button>
            </form>
          ) : (
            <>
              {money(trip.budget)}{' '}
              <button type="button" className="link" onClick={() => setEditTarget(true)}>Change</button>
            </>
          )}
        </p>

        {expenses.length > 0 && (
          <div className="exp-list">
            {[...expenses].reverse().map((x) => (
              <div key={x.id} className="exp">
                <div className="exp-body">
                  <strong>{x.name}</strong>
                  <p>{x.qty} x {money(x.unitPrice)} &middot; {x.category}</p>
                </div>
                <span className="exp-amt">{money(x.amount)}</span>
                <button type="button" className="icon-btn" aria-label="Remove expense" onClick={() => removeExpense(x.id)}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form className="add-exp" onSubmit={addExpense}>
          <div className="field">
            <label>Add an expense</label>
            <div className="item-row">
              <input ref={nameRef} className="grow" placeholder="Item" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="qty" type="number" min="1" aria-label="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} />
              <input className="price" type="number" min="0" step="0.01" aria-label="Unit price" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => <option key={c.name}>{c.name}</option>)}
            </select>
          </div>
          <button className="btn btn-ghost btn-block" type="submit">
            Add {line > 0 ? money(line) : 'expense'} to this goal
          </button>
        </form>

        {confirming ? (
          <div className="confirm">
            {spent === 0 ? (
              <p>Nothing was spent, so nothing will be deducted. Close this goal?</p>
            ) : (
              <>
                <p>This will deduct</p>
                <strong>{money(spent)}</strong>
                <p>from your main balance, recorded under the categories you used.</p>
                {!over && left > 0 && <p className="soft">{money(left)} of your target was not used and stays in your balance.</p>}
                {over && <p className="soft">You went {money(-left)} over your target.</p>}
                {spent > balance && <p className="soft">That is more than your current balance of {money(balance)}.</p>}
              </>
            )}
            <div className="confirm-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setConfirming(false)}>Back</button>
              <button className="btn btn-primary" type="button" onClick={finish}>
                {spent > 0 ? 'Confirm and deduct' : 'Close goal'}
              </button>
            </div>
          </div>
        ) : (
          <div className="sheet-foot">
            <button type="button" className="link discard" onClick={discard}>
              {armDiscard ? 'Tap again to discard' : 'Discard goal'}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
              {spent > 0 ? 'Finish and deduct' : 'Finish'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}