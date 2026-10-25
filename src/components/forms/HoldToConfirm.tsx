import { useEffect, useRef, useState } from 'react';
export function HoldToConfirm({
  onConfirm,
  disabled = false,
}: {
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  function stop() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }
  function start() {
    if (disabled || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm();
    }, 2000);
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <button
      type="button"
      className={`hold-confirm ${holding ? 'holding' : ''}`}
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onBlur={stop}
      onKeyDown={(e) => {
        if (['Enter', ' '].includes(e.key)) {
          e.preventDefault();
          if (!e.repeat) start();
        }
      }}
      onKeyUp={(e) => {
        if (['Enter', ' '].includes(e.key)) {
          e.preventDefault();
          stop();
        }
      }}
      aria-label="Hold for two seconds to confirm SOS"
    >
      <span>{holding ? 'Keep holding…' : 'Hold 2 seconds to raise SOS'}</span>
    </button>
  );
}
