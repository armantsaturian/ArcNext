import iconUrl from '../../arcnext.png'

declare global {
  interface Window {
    fdaDialog: {
      openSettings: () => void
      checkAccess: () => void
      onGranted: (cb: () => void) => void
      onNotGranted: (cb: () => void) => void
    }
  }
}

const DEFAULT_DETAIL =
  'ArcNext needs Full Disk Access to discover your projects. Grant access in System Settings, then come back.'

;(document.getElementById('icon') as HTMLImageElement).src = iconUrl

const openBtn = document.getElementById('openSettings') as HTMLButtonElement
const checkBtn = document.getElementById('checkAccess') as HTMLButtonElement
const detail = document.getElementById('detail') as HTMLDivElement

openBtn.addEventListener('click', () => window.fdaDialog.openSettings())

checkBtn.addEventListener('click', () => {
  checkBtn.textContent = 'Checking...'
  checkBtn.disabled = true
  detail.textContent = DEFAULT_DETAIL
  detail.style.color = ''
  window.fdaDialog.checkAccess()
})

window.fdaDialog.onGranted(() => {
  detail.textContent = 'Access granted! Restarting...'
  detail.style.color = '#4ade80'
  openBtn.style.display = 'none'
  checkBtn.style.display = 'none'
})

window.fdaDialog.onNotGranted(() => {
  detail.textContent =
    'Full Disk Access was not detected yet. Please grant it in System Settings and try again.'
  detail.style.color = '#f87171'
  checkBtn.textContent = "I've Granted Access"
  checkBtn.disabled = false
})

openBtn.focus()

export {}
