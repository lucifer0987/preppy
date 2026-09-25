/**
 * Sound (PRD 8.3).
 *
 * Off by default, toggleable, remembered per browser, and never played while
 * a section timer is running (FR-8.1) — which holds structurally, because the
 * test engine does not import this module.
 *
 * Tones are synthesised with the Web Audio API rather than shipped as files.
 * That keeps the bundle free of binary assets, and it means a blocked or
 * missing audio file can never be the reason a result page fails.
 */

const STORAGE_KEY = 'preppy.sound'

export function soundEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(STORAGE_KEY) === 'on'
}

export function setSoundEnabled(on: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
}

export type Tune = 'result' | 'personal-best' | 'click'

/** Semitone offsets from A4, as a simple rising figure. */
const TUNES: Record<Tune, { steps: number[]; gap: number; duration: number }> = {
  click: { steps: [7], gap: 0, duration: 0.06 },
  result: { steps: [0, 4, 7], gap: 0.09, duration: 0.16 },
  'personal-best': { steps: [0, 4, 7, 12, 16], gap: 0.08, duration: 0.2 },
}

/** Never throws: sound is decoration, and a failure here must not surface. */
export async function play(tune: Tune): Promise<void> {
  if (!soundEnabled()) return
  if (typeof window === 'undefined') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    // Browsers suspend audio until a gesture; a suspended context is not an error.
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)

    const { steps, gap, duration } = TUNES[tune]
    steps.forEach((semitones, i) => {
      const at = ctx.currentTime + i * gap
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = 440 * Math.pow(2, semitones / 12)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + duration + 0.02)
    })

    const total = (steps.length - 1) * gap + duration + 0.1
    setTimeout(() => void ctx.close().catch(() => undefined), total * 1000 + 120)
  } catch {
    // Decoration. Swallow it.
  }
}
