import { app } from 'electron'

// Which platform the app is running as. On a Mac the Windows-only AI engine isn't available yet.
// Development only: SECONDTEAM_PLATFORM=mac makes a Windows dev build behave as the Mac version
// (its folders and menus stay Windows ones), so the Mac UI can be tested on a PC.

const forced = !app.isPackaged ? process.env['SECONDTEAM_PLATFORM'] : undefined

export const isMac = forced ? forced === 'mac' : process.platform === 'darwin'
/** Running on a real Mac (for the menu bar), not just pretending to be one. */
export const onRealMac = process.platform === 'darwin'
