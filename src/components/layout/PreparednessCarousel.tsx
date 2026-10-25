import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
const slides = [
  {
    title: 'When the ground moves.',
    name: 'Earthquake preparedness',
    text: 'Know your spaces. Notice damage. Follow the school’s response plan.',
    position: '0%',
  },
  {
    title: 'When the weather turns.',
    name: 'Typhoon preparedness',
    text: 'Keep people informed and record what needs attention after the storm.',
    position: '50%',
  },
  {
    title: 'When familiar paths change.',
    name: 'Flood preparedness',
    text: 'Check conditions on the ground. A familiar walkway may need a different plan.',
    position: '100%',
  },
];
export function PreparednessCarousel({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(
      () =>
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 6500);
    return () => clearInterval(timer);
  }, [paused]);
  function choose(i: number) {
    setIndex((i + slides.length) % slides.length);
    setPaused(true);
  }
  return (
    <section
      className={`preparedness-carousel ${compact ? 'is-compact' : ''}`}
      aria-label="Disaster preparedness illustrations"
      aria-roledescription="carousel"
    >
      <div className="preparedness-visual">
        {slides.map((slide, i) => (
          <div
            key={slide.name}
            className={`preparedness-scene ${i === index ? 'is-active' : ''}`}
            style={{ backgroundPosition: `${slide.position} center` }}
            role="img"
            aria-label={`${slide.name}: fictional school damage illustration`}
            aria-hidden={i !== index}
          />
        ))}
        <span className="preparedness-art-label">
          PREPAREDNESS ILLUSTRATIONS · FICTIONAL SETTINGS
        </span>
        <div className="preparedness-caption" aria-live={paused ? 'polite' : 'off'}>
          <span>
            {String(index + 1).padStart(2, '0')} / 03 · {slides[index].name}
          </span>
          <h2>{slides[index].title}</h2>
          <p>{slides[index].text}</p>
        </div>
      </div>
      <div className="preparedness-controls">
        <div>
          {slides.map((slide, i) => (
            <button
              key={slide.name}
              onClick={() => choose(i)}
              aria-label={`Show ${slide.name.toLowerCase()}`}
              aria-pressed={index === i}
            >
              <span />
            </button>
          ))}
        </div>
        <div>
          <button onClick={() => choose(index - 1)} aria-label="Previous preparedness illustration">
            <ArrowLeft size={17} />
          </button>
          <button
            onClick={() => setPaused((v) => !v)}
            aria-label={paused ? 'Play preparedness slideshow' : 'Pause preparedness slideshow'}
          >
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
          <button onClick={() => choose(index + 1)} aria-label="Next preparedness illustration">
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </section>
  );
}
export function WelcomeIntro({
  onContinue,
  onReplayLogo,
}: {
  onContinue: () => void;
  onReplayLogo?: () => void;
}) {
  const [signal, setSignal] = useState(false);
  return (
    <main className="welcome-screen">
      <header>
        <a className="welcome-brand" href="#welcome-main">
          <span className="welcome-radar">
            <span />R
          </span>
          <span>
            RADAR<small>Safer schools, together.</small>
          </span>
        </a>
        <button className="desk-link" onClick={onContinue}>
          Skip to sign in <ArrowRight size={16} />
        </button>
      </header>
      <div className="welcome-main" id="welcome-main">
        <div className="welcome-copy">
          <p className="desk-eyebrow">A LITTLE CARE. A STRONGER CAMPUS.</p>
          <h1>
            Before the next bell.
            <br />
            <em>Before the next storm.</em>
          </h1>
          <p>
            A clearer view of your school, a place for every observation, and practical tools for
            the people who look after it.
          </p>
          <button className="desk-button primary" onClick={onContinue}>
            Open RADAR <ArrowRight size={18} />
          </button>
          <button
            className={`welcome-signal ${signal ? 'is-active' : ''}`}
            aria-pressed={signal}
            onClick={() => setSignal((v) => !v)}
          >
            <span className="welcome-signal-orbit">
              <span />
              <span />
              <span />
            </span>
            <span>
              {signal ? 'Every observation starts with you.' : 'Tap to send a little ripple.'}
              <small>A small action can help a whole campus.</small>
            </span>
          </button>
        </div>
        <PreparednessCarousel />
      </div>
      <footer>
        <span>Notice early. Record clearly. Act together.</span>
        {onReplayLogo && (
          <button className="desk-link" onClick={onReplayLogo}>
            Replay logo animation
          </button>
        )}
        <span>Not an emergency dispatch service. Follow local response procedures.</span>
      </footer>
    </main>
  );
}
export function LoginShowcase() {
  return (
    <aside className="login-showcase">
      <div className="welcome-brand">
        <span className="welcome-radar">
          <span />R
        </span>
        <span>
          RADAR<small>One campus. A clearer picture.</small>
        </span>
      </div>
      <PreparednessCarousel compact />
      <p>
        Records, maps and shared awareness help school teams make informed decisions. Always follow
        your school’s approved response procedures.
      </p>
    </aside>
  );
}
