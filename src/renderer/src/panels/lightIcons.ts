import { CloudSun, Flashlight, Lightbulb, Sun, type LucideIcon } from 'lucide-react'
import type { LightKind } from '../../../shared/lighting'

/** Toolbar and outliner icon for each kind of light. */
export const LIGHT_ICONS: Record<LightKind, LucideIcon> = {
  sun: Sun,
  point: Lightbulb,
  spot: Flashlight,
  ambient: CloudSun
}
