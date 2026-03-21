import iconUrl from '../../arcnext.png'

declare global {
  interface Window {
    quitDialog: { quit: () => void; cancel: () => void }
  }
}

;(document.getElementById('icon') as HTMLImageElement).src = iconUrl

const cancelBtn = document.getElementById('cancel') as HTMLButtonElement
const quitBtn = document.getElementById('quit') as HTMLButtonElement
const buttons = [cancelBtn, quitBtn]

cancelBtn.addEventListener('click', () => window.quitDialog.cancel())
quitBtn.addEventListener('click', () => window.quitDialog.quit())

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.quitDialog.cancel()
    return
  }

  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault()
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowLeft' ? 0 : 1
    if (current !== next) buttons[next].focus()
    return
  }
})

// Focus Cancel by default (matches previous defaultId: 1 behavior)
cancelBtn.focus()

export {}
