'use client';

import { useRef, useState } from 'react';
import { UploadCloud, Loader2, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/card';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const MAX_BYTES = 10 * 1024 * 1024;

export function ImageUpload({
  onUploaded,
  disabled,
  label = 'Add inspection photo',
  compact = false,
}: {
  onUploaded: (url: string, file: File) => void | Promise<void>;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const upload = (file: File) => {
    setLastFile(file);
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError('Use a JPEG, PNG, WebP, GIF or SVG image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That image is larger than 10 MB. Choose a smaller file.');
      return;
    }

    setProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads');
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const payload = JSON.parse(xhr.responseText) as { url: string };
          await onUploaded(payload.url, file);
          setProgress(null);
          if (inputRef.current) inputRef.current.value = '';
        } catch {
          setError('The upload completed but the record could not be saved. Retry.');
          setProgress(null);
        }
      } else {
        let message = 'Upload failed.';
        try {
          const payload = JSON.parse(xhr.responseText) as { error?: string };
          if (payload.error) message = payload.error;
        } catch {
          // keep fallback
        }
        setError(message);
        setProgress(null);
      }
    };
    xhr.onerror = () => {
      setError('Network error while uploading. Check your connection and retry.');
      setProgress(null);
    };
    xhr.send(file);
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled) return;
          const file = e.dataTransfer.files?.[0];
          if (file) upload(file);
        }}
        className={cn(
          'rounded-xl border-2 border-dashed border-border bg-muted/30 text-center transition-colors',
          compact ? 'px-3 py-3' : 'px-4 py-6',
          dragging && 'border-accent-foreground bg-accent',
          disabled && 'opacity-60',
        )}
      >
        {progress !== null ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Uploading {progress}%
            </div>
            <div className="mx-auto h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="mx-auto mb-1.5 grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground">
              <UploadCloud className="h-4 w-4" />
            </div>
            <p className="text-xs font-medium text-foreground">{label}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Drag and drop, or choose a file. JPEG, PNG, WebP · max 10 MB.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
            >
              <ImageIcon className="h-3.5 w-3.5" /> Choose image
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(',')}
              className="sr-only"
              disabled={disabled}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
              }}
            />
          </>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-2 text-[11px] text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => {
              if (lastFile) upload(lastFile);
            }}
            className="shrink-0 font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
