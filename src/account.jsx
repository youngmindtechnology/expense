import React, { useState } from 'react';
import { Lock, ArrowLeftRight, X } from 'lucide-react';
import { PROFILE, leaveProfile, hasPin, setPin, clearPin } from './profiles';
import './entry.css';

export default function AccountBar() {
  const [open, setOpen] = useState(false);
  const [pin, setPinValue] = useState('');
  const [locked, setLocked] = useState(hasPin(PROFILE.id));
  const [msg, setMsg] = useState('');

  const save = async (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) return setMsg('Use exactly 4 digits');
    await setPin(PROFILE.id, pin);
    setLocked(true);
    setPinValue('');
    setMsg('');
    setOpen(false);
  };

  const remove = () => {
    clearPin(PROFILE.id);
    setLocked(false);
    setOpen(false);
  };

  return (
    <>
      <div className="account">
        <span className="who">{PROFILE.name}</span>
        <button className="link" onClick={() => { setMsg(''); setOpen(true); }}>
          <Lock size={13} /> {locked ? 'Change PIN' : 'Add a PIN'}
        </button>
        <button className="link" onClick={leaveProfile}>
          <ArrowLeftRight size={13} /> Switch
        </button>
      </div>

      {open && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form className="sheet" onSubmit={save}>
            <div className="sheet-head">
              <h3>Keep it private</h3>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <p className="hint">
              A 4-digit PIN is asked whenever you come in from the welcome page on this phone. It is kept on this device only.
            </p>
            <div className="field">
              <label htmlFor="pin">{locked ? 'New PIN' : 'Choose a PIN'}</label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pin}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                autoFocus
              />
              {msg && <p className="warn">{msg}</p>}
            </div>
            <button className="btn btn-primary btn-block" type="submit">Save PIN</button>
            {locked && (
              <p style={{ textAlign: 'center', margin: '14px 0 0' }}>
                <button type="button" className="link" onClick={remove}>Remove my PIN</button>
              </p>
            )}
          </form>
        </div>
      )}
    </>
  );
}