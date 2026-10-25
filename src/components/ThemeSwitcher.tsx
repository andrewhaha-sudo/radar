'use client';

import { useTheme } from '@/context/ThemeContext';
import { RotateCcw, Check } from 'lucide-react';
import { type ThemeId, type ColorMode } from '@/lib/design-tokens';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
  DrawerClose,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { cn } from '@/components/ui/card';

const MODES: Array<{ id: ColorMode; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

const ACCENTS = ['#3B82F6', '#8B5CF6', '#22D3EE', '#EF4444', '#F97316', '#22C55E', '#EC4899'];

export function ThemeSwitcher() {
  const {
    themeId,
    setTheme,
    colorMode,
    setColorMode,
    accent,
    setAccent,
    resolvedMode,
    availableThemes,
  } = useTheme();

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Appearance settings" title="Appearance">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent side="right" size="md">
        <DrawerHeader>
          <DrawerTitle>Appearance</DrawerTitle>
          <DrawerDescription>
            Themes adapt to light or dark mode. Severity colours stay consistent everywhere.
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="space-y-7">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Colour mode
            </h3>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Colour mode">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setColorMode(mode.id)}
                  aria-pressed={colorMode === mode.id}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    colorMode === mode.id
                      ? 'border-accent-foreground bg-accent text-accent-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently rendering the <span className="font-medium text-foreground">{resolvedMode}</span> palette.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Theme
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {availableThemes.map((t) => {
                const palette = t.palettes[resolvedMode];
                const selected = themeId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id as ThemeId)}
                    aria-pressed={selected}
                    className={cn(
                      'group relative overflow-hidden rounded-xl border p-3 text-left transition-all',
                      selected
                        ? 'border-accent-foreground ring-2 ring-ring/40'
                        : 'border-border hover:border-accent-border',
                    )}
                  >
                    <span
                      className="absolute inset-x-0 top-0 h-1.5"
                      style={{ background: palette.primary }}
                    />
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{t.label}</span>
                      {selected && <Check className="h-4 w-4 text-accent-foreground" />}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                    <div className="mt-3 flex gap-1.5">
                      {[palette.bg, palette.card, palette.border, palette.primary, palette.textMuted].map(
                        (c, i) => (
                          <span
                            key={`${t.id}-${i}`}
                            className="h-4 w-4 rounded-full border border-black/10"
                            style={{ background: c }}
                          />
                        ),
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Accent colour
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENTS.map((color) => (
                <button
                  key={color}
                  onClick={() => setAccent(color)}
                  className={cn(
                    'h-8 w-8 rounded-full border-2 border-card transition-transform hover:scale-110',
                    accent.toLowerCase() === color.toLowerCase()
                      ? 'ring-2 ring-ring ring-offset-2 ring-offset-card'
                      : '',
                  )}
                  style={{ backgroundColor: color }}
                  aria-label={`Use accent ${color}`}
                  aria-pressed={accent.toLowerCase() === color.toLowerCase()}
                />
              ))}
              <label className="ml-1 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : '#3B82F6'}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  aria-label="Custom accent colour"
                />
                Custom
              </label>
            </div>
            <Input
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              aria-label="Accent hex value"
              className="h-9 max-w-[160px] font-mono text-xs"
            />
          </section>

          <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
            Changes apply instantly and are stored on this device. Hazard severity is always paired with a
            shape and text label, so colour is never the only signal.
          </div>
        </DrawerBody>

        <DrawerFooter className="flex justify-end">
          <DrawerClose asChild>
            <Button variant="primary">Done</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
