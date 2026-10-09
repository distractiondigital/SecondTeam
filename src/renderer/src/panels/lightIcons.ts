import { CloudSun, Flashlight, LampDesk, LampFloor, Lightbulb, Sparkles, Sun, type LucideIcon } from 'lucide-react'
import type { LightKind } from '../../../shared/lighting'
import type { PracticalKind } from '../../../shared/practicals'

/** Toolbar and outliner icon for each kind of light. */
export const LIGHT_ICONS: Record<LightKind, LucideIcon> = {
  sun: Sun,
  point: Lightbulb,
  spot: Flashlight,
  ambient: CloudSun
}

/** Outliner icon for each kind of practical (a tall lamp is a floor lamp). */
export function practicalIcon(kind: PracticalKind, height: number): LucideIcon {
  if (kind === 'lamp') return height > 1 ? LampFloor : LampDesk
  return kind === 'bulb' ? Lightbulb : kind === 'flashlight' ? Flashlight : Sparkles
}
