import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { homedir } from 'os'

const PROMPT =
  'You are a workspace namer. Read the context and output exactly 3 keywords that identify this work session. ' +
  'Rules: ' +
  '1. Use specific identifiers only: project names, feature names, tool names, proper nouns, filenames. ' +
  '2. No generic words: fix, bug, update, code, react, implement, add, change, work, task, feature, issue. ' +
  '3. ALL LOWERCASE. No capitals, no title case. ' +
  '4. No punctuation, no quotes, no explanation. Just 3 words separated by spaces. ' +
  'Examples: "zappa in arcnext", "autorename in arcnext", "nebius hw2 cifar10", "whisper dictation arcnext". ' +
  'Output ONLY 3 lowercase words, nothing else.'

let summarizeAvailable: boolean | null = null

function checkSummarize(): Promise<boolean> {
  if (summarizeAvailable !== null) return Promise.resolve(summarizeAvailable)

  return new Promise((resolve) => {
    execFile('which', ['summarize'], { timeout: 3000 }, (err) => {
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
  ipcMain.handle('aiRename:generate', async (_event, context: string) => {
    try {
      const available = await checkSummarize()
      if (!available) return { name: null }
      return await generate(context)
    } catch {
      return { name: null }
    }
  })
}
