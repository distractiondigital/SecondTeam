// Mac or Windows, and the keys that differ. On a Mac, Ctrl+click is a right-click, so adding to a
// selection (and the other "hold Ctrl" moves) use Cmd there; the menus say Cmd and Option.

export const isMac = typeof window !== 'undefined' && window.secondTeam?.platform === 'mac'

/** The "add / remove / fine-tune" modifier: Cmd on a Mac, Ctrl on Windows. */
export function addKey(e: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return isMac ? e.metaKey : e.ctrlKey
}

/** The name of that key, and of Alt, for hints. */
export const CTRL = isMac ? 'Cmd' : 'Ctrl'
export const ALT = isMac ? 'Option' : 'Alt'
