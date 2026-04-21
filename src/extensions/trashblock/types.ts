export interface TrashblockData {
  enabled: boolean
  blockedSites: string[]
  unlockPhrase: string
  unlockedSites: Record<string, number>
  activeDays: number[]
  daysConfigured: boolean
}
