import iconUrl from '../../arcnext.png'

declare global {
  interface Window {
    quitDialog: { quit: () => void; cancel: () => void }
  }
}

;(document.getElementById('icon') as HTMLImageElement).src = iconUrl

const cancelBtn = document.getElementById('cancel') as HTMLButtonElement
const quitBtn = document.getElementById('quit') as HTMLButtonElement

cancelBtn.addEventListener('click', () => window.quitDialog.cancel())
quitBtn.addEventListener('click', () => window.quitDialog.quit())

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.quitDialog.cancel()
    return
  }

  if (e.key === 'Enter') {
    window.quitDialog.quit()
    return
  }
})

export {}
