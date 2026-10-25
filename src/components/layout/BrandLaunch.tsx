import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';

/** A short brand introduction, not a progress indicator for network work. */
export function BrandLaunch({ onComplete }: { onComplete: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    // 4.65 seconds of logo + 0.35 seconds of exit = five seconds total.
    const timer = window.setTimeout(() => setLeaving(true), 4650);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(onComplete, 350);
    return () => window.clearTimeout(timer);
  }, [leaving, onComplete]);
  return (
    <main
      className={`brand-launch ${leaving ? 'is-leaving' : ''}`}
      aria-label="RADAR opening animation"
    >
      <div className="launch-grid" aria-hidden="true" />
      <button className="launch-skip" autoFocus onClick={onComplete}>
        Skip intro <ArrowRight size={16} />
      </button>
      <div className="launch-composition">
        <div className="launch-orbit" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <svg
          className="launch-shield"
          viewBox="0 0 200 220"
          fill="none"
          role="img"
          aria-label="RADAR shield and radar logo"
        >
          <defs>
            <linearGradient
              id="launch-shield-color"
              x1="30"
              y1="20"
              x2="165"
              y2="200"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#55e3e0" />
              <stop offset=".5" stopColor="#20b9ff" />
              <stop offset="1" stopColor="#3172ff" />
            </linearGradient>
            <linearGradient
              id="launch-fill"
              x1="25"
              y1="20"
              x2="175"
              y2="200"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#0c455b" />
              <stop offset="1" stopColor="#071827" />
            </linearGradient>
          </defs>
          <path
            className="launch-shield-fill"
            d="M100 15 174 44 167 119Q157 167 100 202 43 167 33 119L26 44Z"
            fill="url(#launch-fill)"
          />
          <path
            className="launch-shield-trace"
            pathLength="1"
            d="M100 15 174 44 167 119Q157 167 100 202 43 167 33 119L26 44Z"
            stroke="url(#launch-shield-color)"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <g className="launch-rings" stroke="url(#launch-shield-color)">
            <circle cx="100" cy="103" r="48" strokeWidth="1.5" />
            <circle cx="100" cy="103" r="32" strokeWidth="1" opacity=".6" />
            <circle cx="100" cy="103" r="16" strokeWidth="1" opacity=".35" />
          </g>
          <g className="launch-sweep">
            <path d="M100 103V55A48 48 0 0 1 148 103Z" fill="#36d9e5" fillOpacity=".18" />
            <path d="M100 103V55" stroke="#77fff0" strokeWidth="2" />
          </g>
          <circle className="launch-detection" cx="127" cy="78" r="4" fill="#a0fff4" />
          <text
            className="launch-letter"
            x="100"
            y="115"
            textAnchor="middle"
            fill="#dbffff"
            fontSize="34"
            fontWeight="700"
            fontFamily="inherit"
          >
            R
          </text>
        </svg>
        <div className="launch-wordmark" aria-hidden="true">
          {'RADAR'.split('').map((letter, i) => (
            <span key={i} style={{ animationDelay: `${850 + i * 75}ms` }}>
              {letter}
            </span>
          ))}
        </div>
        <p className="launch-tagline">Safer schools. Stronger communities.</p>
        <span className="launch-line" aria-hidden="true" />
      </div>
      <p className="launch-footnote">NOTICE EARLY · ACT TOGETHER</p>
    </main>
  );
}
