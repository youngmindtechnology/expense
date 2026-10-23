import React, { useState } from 'react';
import { Camera, X } from 'lucide-react';
import { PROFILES, enterProfile, hasPin, checkPin, getPhoto, savePhoto, resizeImage } from './profiles';
import { Petals, Heart3D, HEART_PATH } from './Romance';
import './entry.css';

export default function Welcome() {
  const [pending, setPending] = useState(null); // profile waiting for its PIN
  const [leaving, setLeaving] = useState(null); // id of the card that was chosen
  const [photos, setPhotos] = useState(() => ({ him: getPhoto('him'), her: getPhoto('her') }));

  const go = (p) => {
    setPending(null);
    setLeaving(p.id);
    setTimeout(() => enterProfile(p.id), 520);
  };

  const choose = (p) => {
    if (leaving) return;
    if (hasPin(p.id)) setPending(p);
    else go(p);
  };

  const changePhoto = async (p, file) => {
    if (!file) return;
    try {
      const url = await resizeImage(file);
      savePhoto(p.id, url);
      setPhotos((prev) => ({ ...prev, [p.id]: url }));
    } catch {
      /* unreadable image, keep the current one */
    }
  };

  return (
    <div className={`welcome ${leaving ? 'leaving' : ''}`}>
      <Petals />
      <div className="welcome-inner">
        <p className="w-eyebrow">Our little corner</p>
        <h1 className="w-title">Welcome, you two</h1>
        <div className="w-orn" aria-hidden="true">
          <i />
          <svg viewBox="0 0 100 90"><path d={HEART_PATH} /></svg>
          <i />
        </div>
        <p className="w-sub">Where would you like to go today?</p>

        <div className="w-cards">
          {[PROFILES.him, PROFILES.her].map((p, i) => (
            <ProfileCard
              key={p.id}
              profile={p}
              photo={photos[p.id]}
              index={i}
              state={leaving ? (leaving === p.id ? 'chosen' : 'fade') : ''}
              onChoose={() => choose(p)}
              onPhoto={(file) => changePhoto(p, file)}
            />
          ))}
          <div className="w-heart" aria-hidden="true"><Heart3D /></div>
        </div>

        <p className="w-foot">Tap your card to open your own ledger.</p>
      </div>

      {pending && <PinPad profile={pending} onCancel={() => setPending(null)} onSuccess={() => go(pending)} />}
    </div>
  );
}

function ProfileCard({ profile, photo, index, state, onChoose, onPhoto }) {
  const [badSrc, setBadSrc] = useState(null);
  const src = photo || profile.photo;
  const broken = badSrc === src;

  const tilt = (e) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${x * 14}deg`);
    el.style.setProperty('--rx', `${-y * 12}deg`);
  };
  const reset = (e) => {
    e.currentTarget.style.setProperty('--ry', '0deg');
    e.currentTarget.style.setProperty('--rx', '0deg');
  };

  return (
    <div
      className={`w-card ${profile.variant} ${state}`}
      style={{ '--i': index }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${profile.name}'s ledger`}
      onClick={onChoose}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onChoose())}
      onPointerMove={tilt}
      onPointerLeave={reset}
    >
      <div className="w-photo">
        {broken ? (
          <div className="w-mono">{profile.name.trim().charAt(0).toUpperCase()}</div>
        ) : (
          <img key={src} src={src} alt="" draggable="false" onError={() => setBadSrc(src)} />
        )}
      </div>
      <div className="w-frame" aria-hidden="true" />
      <div className="w-label">
        <strong>{profile.name}</strong>
        <span>{profile.line}</span>
      </div>
      <label className="w-cam" aria-label="Change photo" onClick={(e) => e.stopPropagation()}>
        <Camera size={14} />
        <input
          type="file"
          accept="image/*"
          hidden
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }}
        />
      </label>
    </div>
  );
}

function PinPad({ profile, onCancel, onSuccess }) {
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);

  const onChange = async (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
    setPin(v);
    if (v.length < 4) return;
    if (await checkPin(profile.id, v)) {
      onSuccess();
    } else {
      setBad(true);
      setPin('');
      setTimeout(() => setBad(false), 700);
    }
  };

  return (
    <div className="w-modal" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className={`w-pin ${bad ? 'bad' : ''}`}>
        <button type="button" className="w-x" aria-label="Close" onClick={onCancel}><X size={16} /></button>
        <p className="w-pin-hi">Welcome back</p>
        <h2>{profile.name}</h2>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={pin}
          onChange={onChange}
          aria-label="PIN"
        />
        <p className="w-pin-msg">{bad ? 'That is not the right PIN' : 'Enter your 4-digit PIN'}</p>
      </div>
    </div>
  );
}