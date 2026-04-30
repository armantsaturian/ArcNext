import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { homedir } from 'os'

const PROMPT =
  'You are a workspace namer. Read the context and output a single emoji followed by 2-3 keywords that identify this work session. ' +
  'Rules: ' +
  '1. Pick ONE emoji that fits the actual work (🎙️ for dictation/audio, 🔒 for auth/security, 🧪 for tests, 🐛 for bugs, 📦 for releases/builds, 🎨 for UI/design, 🤖 for AI/agents, 🌐 for browser/web, 📝 for docs, 🗂️ for refactors, ⚡ for perf, 🔧 for tooling, etc). Pick what matches — don\'t force these. ' +
  '2. Then 2-3 specific keywords: project names, feature names, tool names, proper nouns, filenames. ' +
  '3. No generic words: fix, bug, update, code, react, implement, add, change, work, task, feature, issue. ' +
  '4. Keywords ALL LOWERCASE. No capitals, no title case. ' +
  '5. No punctuation, no quotes, no explanation. Format: "<emoji> word word word". ' +
  'Examples: "🤖 autorename arcnext", "🎙️ whisper dictation", "🧪 cifar10 nebius", "🔮 claude dangerous", "🌐 webbridge snapshot". ' +
  'Output ONLY the emoji and 2-3 lowercase words, nothing else.'

let summarizeAvailable: boolean | null = null

function checkSummarize(): Promise<boolean> {
  if (summarizeAvailable === true) return Promise.resolve(true)

  return new Promise((resolve) => {
    const home = homedir()
    const env = {
      ...process.env,
      PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:${home}/.local/bin`
    }
    execFile('which', ['summarize'], { timeout: 3000, env }, (err) => {
      summarizeAvailable = !err
      resolve(summarizeAvailable)
    })
  })
}

function generate(context: string): Promise<{ name: string | null }> {
  return new Promise((resolve) => {
    const args = [
      '-',
      '--model', 'openai/gpt-5.4-mini',
      '--prompt', PROMPT,
      '--length', 'short',
      '--json'
    ]

    const home = homedir()
    const env = {
      ...process.env,
      PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:${home}/.local/bin`
    }

    const child = execFile('summarize', args, { timeout: 10_000, env }, (err, stdout) => {
      if (err || !stdout) {
        resolve({ name: null })
        return
      }

      try {
        const parsed = JSON.parse(stdout)
        const name = parsed.summary?.trim() || null
        resolve({ name })
      } catch {
        resolve({ name: null })
      }
    })

    child.stdin?.write(context.slice(0, 1000))
    child.stdin?.end()
  })
}

export function setupAiRename(): void {
  ipcMain.handle('aiRename:checkAvailable', async () => {
    return { available: await checkSummarize() }
  })

  ipcMain.handle('aiRename:generate', async (_event, context: string) => {
    try {
      const available = await checkSummarize()
      if (!available) return { name: null, reason: 'missing' as const }
      return await generate(context)
    } catch {
      return { name: null }
    }
  })
}
