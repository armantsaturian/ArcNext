import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { statSync, accessSync, constants } from 'fs'
import type { DirEntry } from '../shared/types'

interface DiscoveredDir {
  path: string
  mtime: number
}

const MAX_DISCOVERED = 200
const MAX_DEPTH = 4

const PRUNE_DIRS = [
  'Library', 'node_modules', '.cache', 'Caches',
  '.Trash', 'System', '.cargo', '.npm', '.rustup',
  '.local', 'vendor'
]

const COMMON_FOLDERS = ['Desktop', 'Documents', 'Downloads']

let cachedEntries: DirEntry[] = []

function mtimeScore(mtime: number): number {
  const ageHours = (Date.now() - mtime) / (1000 * 60 * 60)
  if (ageHours < 24) return 0.3
  if (ageHours < 7 * 24) return 0.2
  if (ageHours < 30 * 24) return 0.1
  return 0.05
}

function dirExists(p: string): boolean {
  try {
    accessSync(p, constants.R_OK)
    return true
  } catch {
    return false
  }
}

function discoverGitRepos(): Promise<DiscoveredDir[]> {
  const home = homedir()
  const pruneExpr = PRUNE_DIRS.flatMap((d, i) =>
    i === 0 ? ['-name', d] : ['-o', '-name', d]
  )
  const args = [
    home, '-maxdepth', String(MAX_DEPTH),
    '(', ...pruneExpr, ')', '-prune',
    '-o', '-name', '.git', '-type', 'd', '-print'
  ]

  return new Promise((resolve) => {
    execFile('find', args, { timeout: 30_000 }, (err, stdout) => {
      if (err && !stdout) {
        resolve([])
        return
      }
      const repos: DiscoveredDir[] = []
      const lines = (stdout || '').trim().split('\n').filter(Boolean)
      for (const line of lines) {
        const repoPath = dirname(line)
        try {
          const stat = statSync(line)
          repos.push({ path: repoPath, mtime: stat.mtimeMs })
        } catch {
          // inaccessible — skip
        }
      }
      resolve(repos)
    })
  })
}

function getCommonFolders(): DiscoveredDir[] {
  const home = homedir()
  const result: DiscoveredDir[] = []
  for (const name of COMMON_FOLDERS) {
    const p = join(home, name)
    if (dirExists(p)) {
      try {
        const stat = statSync(p)
        result.push({ path: p, mtime: stat.mtimeMs })
      } catch {
        // skip
      }
    }
  }
  return result
}

async function runDiscovery(): Promise<void> {
  const repos = await discoverGitRepos()
  const common = getCommonFolders()

  const seen = new Set<string>()
  const all: DiscoveredDir[] = []
  for (const d of [...repos, ...common]) {
    if (!seen.has(d.path)) {
      seen.add(d.path)
      all.push(d)
    }
  }

  all.sort((a, b) => b.mtime - a.mtime)
  const capped = all.slice(0, MAX_DISCOVERED)

  cachedEntries = capped.map((d) => ({
    path: d.path,
    visitCount: 0,
    lastVisit: 0,
    score: mtimeScore(d.mtime)
  }))
}

export function setupDirDiscovery(): void {
  runDiscovery().catch(() => {})

  ipcMain.handle('dirDiscovery:query', () => {
    return cachedEntries
  })
}
