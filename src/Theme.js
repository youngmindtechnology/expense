// Which look the app uses is decided by who signed in on the welcome page.
// Names, the note and the photos live in profiles.js.

import { PROFILE, PROFILES, HERO_LINE, LOVE_NOTE } from './profiles';

const classic = {
  variant: 'classic',
  romantic: false,
  docTitle: 'Campus Ledger',
  eyebrow: 'Campus Ledger',
  title: 'Your money, this semester',
  categoryColors: null,
  toasts: {}
};

const rose = {
  variant: 'rose',
  romantic: true,
  docTitle: 'Our Little Ledger',
  eyebrow: 'Made for you',
  title: 'Every cedi, with care',

  herName: PROFILES.her.name,
  fromName: PROFILES.him.name,
  heroLine: HERO_LINE,
  note: LOVE_NOTE,

  // dusty rose, plum, champagne, sage, slate blue, taupe
  categoryColors: ['#b5485d', '#7a5780', '#c08a4b', '#6f8f72', '#6a86a0', '#8a7468'],

  toasts: {
    income: 'Added. Good to see it grow.',
    expense: 'Recorded. Thank you for keeping track.',
    edit: 'Updated.'
  }
};

export const THEME = PROFILE?.variant === 'rose' ? rose : classic;

if (typeof document !== 'undefined') {
  document.documentElement.dataset.theme = THEME.variant;
  document.title = PROFILE ? THEME.docTitle : 'Welcome';
}