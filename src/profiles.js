// The two people who use this site, and everything personal about them.
// Change the words in quotes. Put your photos in public/photos/him.jpg and
// public/photos/her.jpg (portrait works best). Until then a monogram shows.

export const PROFILES = {
  him: {
    id: 'him',
    name: 'Appiah Isaac',
    line: 'His ledger',
    variant: 'classic',
    photo: '/photos/him.jpg',
    dbName: 'CampusExpenseDB', // keeps the data you already have on this phone
    adoptsUnowned: true // cloud rows saved before profiles existed belong to you
  },
  her: {
    id: 'her',
    name: 'Natasha Agyen',
    line: 'My princess',
    variant: 'rose',
    photo: '/photos/her.jpg',
    dbName: 'CampusExpenseDB_her'
  }
};

// Shown on her side of the site, signed with your name.
export const HERO_LINE = 'Here is where your money stands today.';
export const LOVE_NOTE =
  'I made this so money is one less thing for you to carry. Whatever you need, we will work it out together.';

/* ---------- who is signed in on this device ---------- */

const KEY = 'ledger_profile';

export function getProfileId() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const PROFILE = PROFILES[getProfileId()] || null;

export function enterProfile(id) {
  try { localStorage.setItem(KEY, id); } catch { /* storage unavailable */ }
  window.location.reload();
}

export function leaveProfile() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  window.location.reload();
}

/* ---------- optional PIN (stored on this device only, as a hash) ---------- */

const pinKey = (id) => `ledger_pin_${id}`;

async function hashPin(id, pin) {
  const text = `ledger:${id}:${pin}`;
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (const ch of text) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return String(h);
}

export function hasPin(id) {
  try { return !!localStorage.getItem(pinKey(id)); } catch { return false; }
}

export async function setPin(id, pin) {
  localStorage.setItem(pinKey(id), await hashPin(id, pin));
}

export function clearPin(id) {
  try { localStorage.removeItem(pinKey(id)); } catch { /* storage unavailable */ }
}

export async function checkPin(id, pin) {
  try {
    return localStorage.getItem(pinKey(id)) === (await hashPin(id, pin));
  } catch {
    return false;
  }
}

/* ---------- profile photos picked on this device ---------- */

export function getPhoto(id) {
  try { return localStorage.getItem(`ledger_photo_${id}`); } catch { return null; }
}

export function savePhoto(id, dataUrl) {
  try { localStorage.setItem(`ledger_photo_${id}`, dataUrl); } catch { /* storage full */ }
}

export function resizeImage(file, w = 480, h = 640) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      canvas.getContext('2d').drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}