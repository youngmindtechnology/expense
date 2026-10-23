import React, { useMemo } from 'react';
import { THEME } from './Theme';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

/* Slow drifting petals behind the page. Pure CSS motion, no libraries. */
export function Petals() {
  const petals = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: (i * 37 + 11) % 100,
        size: 9 + ((i * 7) % 10),
        dur: 16 + ((i * 5) % 12),
        delay: -((i * 3.1) % 20),
        drift: 30 + ((i * 13) % 70),
        tone: i % 3
      })),
    []
  );
  return (
    <div className="petals" aria-hidden="true">
      {petals.map((p, i) => (
        <i
          key={i}
          className={`petal tone${p.tone}`}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.35,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            '--drift': `${p.drift}px`
          }}
        />
      ))}
    </div>
  );
}

/* A heart with real depth: 14 thin slices stacked in 3D, swaying gently. */
export const HEART_PATH =
  'M50 86 C14 58 4 38 4 24 C4 11 14 3 26 3 C36 3 45 9 50 18 C55 9 64 3 74 3 C86 3 96 11 96 24 C96 38 86 58 50 86 Z';

export function Heart3D() {
  const N = 14;
  return (
    <div className="heart3d" aria-hidden="true">
      <div className="heart3d-spin">
        {Array.from({ length: N }, (_, i) => {
          const front = i === N - 1;
          const light = 28 + (i / (N - 1)) * 22;
          return (
            <svg
              key={i}
              className="heart3d-layer"
              viewBox="0 0 100 90"
              style={{ transform: `translateZ(${(i - N / 2) * 2.2}px)` }}
            >
              {front && (
                <defs>
                  <radialGradient id="heartShine" cx="32%" cy="25%" r="78%">
                    <stop offset="0" stopColor="#ef8ba1" />
                    <stop offset="0.55" stopColor="#c4415d" />
                    <stop offset="1" stopColor="#8c2243" />
                  </radialGradient>
                </defs>
              )}
              <path d={HEART_PATH} fill={front ? 'url(#heartShine)' : `hsl(346, 58%, ${light}%)`} />
              {front && <ellipse cx="29" cy="21" rx="11" ry="5" fill="#fff" opacity="0.24" transform="rotate(-28 29 21)" />}
            </svg>
          );
        })}
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="hero">
      <div>
        <p className="hero-greet">{greeting()},</p>
        <h2 className="hero-name">{THEME.herName}</h2>
        <p className="hero-line">{THEME.heroLine}</p>
      </div>
      <Heart3D />
    </section>
  );
}

export function LoveNote() {
  if (!THEME.note) return null;
  return (
    <aside className="note">
      <p>{THEME.note}</p>
      <span>{THEME.fromName}</span>
    </aside>
  );
}