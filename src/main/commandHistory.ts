import { ipcMain } from 'electron'
import { readShellHistory, shellHistoryScore } from './shellHistory'
import type { CommandEntry } from '../shared/types'

export function setupCommandHistory(): void {
  ipcMain.handle('commandHistory:query', (): CommandEntry[] => {
    const now = Date.now()
    return readShellHistory().map((entry) => ({
      ...entry,
      score: shellHistoryScore(entry, now)
    }))
  })
}
