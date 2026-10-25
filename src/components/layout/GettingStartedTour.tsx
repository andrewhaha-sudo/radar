import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Camera,
  Compass,
  MapPin,
  ScanEye,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
export const TOUR_VERSION = 'campus-notebook-1';
export function GettingStartedTour() {
  const { user, school, can, activeWorkspaceId } = useAuth(),
    navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null),
    [step, setStep] = useState(0);
  const userId = user?.id;
  const key = `radar:tour:${user?.accountScope ?? user?.id}:${TOUR_VERSION}`;
  const slides = [
    {
      title: 'A clearer place to begin.',
      tag: 'WELCOME TO YOUR CAMPUS NOTEBOOK',
      text: 'Your dashboard puts the campus view and the next useful action together. When school records report an active incident, response takes priority.',
      benefit: 'Less searching. More attention where it matters.',
      icon: Compass,
      show: true,
    },
    {
      title: 'One campus. Three ways to explore.',
      tag: 'MAP · CLOSE-UP · BUILDINGS',
      text: `Switch between the map, a published photo or video frame, and ${can('buildings:read') ? 'the building directory' : 'a building overview'}. Expand a view when you need detail without filling the whole dashboard.`,
      benefit: 'Familiar places make records easier to understand.',
      icon: MapPin,
      show: true,
    },
    {
      title: can('scan:read')
        ? 'Small observations become useful records.'
        : 'Your observations have a place.',
      tag: 'INSPECTIONS & FOLLOW-UP',
      text: can('scan:read')
        ? 'Choose a room, attach clear evidence, and review proposed findings before submission. AI is optional; you can record observations manually.'
        : 'Report what you notice when your role allows it, and follow the school’s updates. School staff review findings and decide what action is needed.',
      benefit: 'A photo and a clear note are better than a forgotten concern.',
      icon: ScanEye,
      show: can('scan:read') || can('hazards:report') || can('hazards:read'),
    },
    {
      title: 'See a path. Check it on the ground.',
      tag: 'NEW · PHOTO ROUTE STUDIO',
      text:
        can('scan:write') || can('evacuation:write')
          ? 'Use a photo or video frame to sketch a visible path and prepare field notes. Image sketches stay separate from approved evacuation routes; staff still verify the real walkway.'
          : 'Explore path sketches shared by your school team. These image sketches stay separate from approved evacuation routes; staff still verify the real walkway.',
      benefit: 'An easier starting point for a practical field walk.',
      icon: Camera,
      show: can('evacuation:read'),
    },
    {
      title: 'Keep your useful tools close.',
      tag: 'SEARCH · PIN · PICK UP AGAIN',
      text: 'Tools & setup groups tasks by purpose. Search for a task and pin the tools you use most. Saved offline work sends only when you explicitly sync it.',
      benefit: 'Fewer repeated panels, clearer next steps, and less busywork.',
      icon: Bookmark,
      show: true,
    },
    {
      title: activeWorkspaceId
        ? 'Your school comes back with you.'
        : 'Connect with the right school.',
      tag: 'YOUR ACCOUNT, YOUR ACCESS',
      text: activeWorkspaceId
        ? `You’re connected to ${school?.name || 'your school'} as ${user?.role}. Your authorized school selection is remembered across sign-ins; logging out does not delete its map, records or published view.`
        : 'Choose your school to connect with its workspace. Existing approved members return automatically. New memberships need one identity check by school staff before private school records open.',
      benefit: 'The right context, with school-specific permissions.',
      icon: ShieldCheck,
      show: true,
    },
  ].filter((slide) => slide.show);
  function finish() {
    try {
      localStorage.setItem(key, 'seen');
    } catch {}
    dialog.current?.close();
  }
  useEffect(() => {
    if (!userId) return;
    const modal = dialog.current;
    let seen = false;
    try {
      seen = localStorage.getItem(key) === 'seen';
    } catch {}
    if (!seen) {
      modal?.showModal();
    }
    const replay = () => {
      setStep(0);
      if (!dialog.current?.open) dialog.current?.showModal();
    };
    window.addEventListener('radar:show-tour', replay);
    return () => {
      window.removeEventListener('radar:show-tour', replay);
      modal?.close();
    };
  }, [key, userId]);
  const current = slides[Math.min(step, slides.length - 1)];
  if (!user) return null;
  return (
    <>
      <dialog
        ref={dialog}
        className="getting-started-dialog"
        onCancel={() => {
          try {
            localStorage.setItem(key, 'seen');
          } catch {}
        }}
      >
        <button className="tour-close" aria-label="Close getting started tour" onClick={finish}>
          <X size={21} />
        </button>
        <div className="tour-art" aria-hidden="true">
          <span />
          <span />
          <span />
          <current.icon size={58} strokeWidth={1} />
          <b>{String(step + 1).padStart(2, '0')}</b>
        </div>
        <div className="tour-body">
          <p className="desk-eyebrow">{current.tag}</p>
          <h2>{current.title}</h2>
          <p>{current.text}</p>
          <div className="tour-benefit">{current.benefit}</div>
          <div className="tour-progress" aria-label={`Tour step ${step + 1} of ${slides.length}`}>
            {slides.map((slide, i) => (
              <button
                key={slide.tag}
                aria-label={`Go to tour step ${i + 1}`}
                aria-current={i === step ? 'step' : undefined}
                onClick={() => setStep(i)}
              />
            ))}
          </div>
          <footer>
            <button
              className="desk-link"
              onClick={step === 0 ? finish : () => setStep((i) => i - 1)}
            >
              {step === 0 ? (
                'Not now'
              ) : (
                <>
                  <ArrowLeft size={14} /> Back
                </>
              )}
            </button>
            {step === slides.length - 1 ? (
              <button
                className="desk-button primary"
                onClick={() => {
                  finish();
                  navigate('/dashboard');
                }}
              >
                Go to my dashboard <ArrowRight size={16} />
              </button>
            ) : (
              <button className="desk-button primary" onClick={() => setStep((i) => i + 1)}>
                {step === 0 ? 'Let’s get started' : 'Next'}
                <ArrowRight size={16} />
              </button>
            )}
          </footer>
        </div>
      </dialog>
    </>
  );
}
