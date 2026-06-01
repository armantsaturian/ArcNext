import { usePaneStore } from '../store/paneStore'

const SIDEBAR_CONTROL_REVEAL_DELAY_MS = 220

let trafficLightsRevealTimer: number | null = null

function clearTrafficLightsRevealTimer(): void {
  if (trafficLightsRevealTimer === null) return
  window.clearTimeout(trafficLightsRevealTimer)
  trafficLightsRevealTimer = null
}

function syncTrafficLightsForSidebar(nextCollapsed: boolean): void {
  clearTrafficLightsRevealTimer()
  window.arcnext.sidebar.setTrafficLightsVisible(false)

  if (nextCollapsed) return

  trafficLightsRevealTimer = window.setTimeout(() => {
    window.arcnext.sidebar.setTrafficLightsVisible(true)
    trafficLightsRevealTimer = null
  }, SIDEBAR_CONTROL_REVEAL_DELAY_MS)
}

export function toggleSidebarWithChrome(): void {
  const state = usePaneStore.getState()
  syncTrafficLightsForSidebar(!state.sidebarCollapsed)
  state.toggleSidebar()
}
