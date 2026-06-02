import { useState } from 'react'
import type { DownloadEntry } from '../../shared/types'
import { refreshDownloads, useDownloadsSnapshot } from '../store/downloadsStore'
import { usePaneStore } from '../store/paneStore'

function DownloadsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8.7 12.7 12 16l3.3-3.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3.5h8l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V3.5Z" fill="currentColor" opacity="0.22" />
      <path d="M14 3.5V8h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" opacity="0.8" />
    </svg>
  )
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return seconds <= 1 ? 'just now' : `${seconds} seconds ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

function downloadSubtitle(download: DownloadEntry): string {
  if (download.state === 'completed') {
    return formatRelativeTime(download.completedAt ?? download.startedAt)
  }

  if (download.state === 'interrupted') {
    return 'Interrupted'
  }

  if (download.totalBytes > 0) {
    const percent = Math.max(0, Math.min(100, Math.round((download.receivedBytes / download.totalBytes) * 100)))
    return `${percent}% of ${formatBytes(download.totalBytes)}`
  }

  return `${formatBytes(download.receivedBytes)} downloaded`
}

function progressPercent(download: DownloadEntry): number | null {
  if (download.state !== 'progressing' || download.totalBytes <= 0) return null
  return Math.max(0, Math.min(100, (download.receivedBytes / download.totalBytes) * 100))
}

function shortName(filename: string): string {
  if (filename.length <= 20) return filename
  const dot = filename.lastIndexOf('.')
  const ext = dot > 0 ? filename.slice(dot) : ''
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  return `${stem.slice(0, Math.max(8, 17 - ext.length))}…${ext}`
}

function downloadAnimationKey(download: DownloadEntry): string {
  return `${download.path}:${Math.floor(download.startedAt / 5000)}`
}

function newestRecentDownload(downloads: DownloadEntry[]): DownloadEntry | undefined {
  const now = Date.now()
  return downloads.find((download) => now - download.startedAt < 8000)
}

export default function DownloadsTray() {
  const downloads = useDownloadsSnapshot()
  const arrivingDownload = newestRecentDownload(downloads)
  const setOverlay = usePaneStore((s) => s.setOverlay)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; download: DownloadEntry } | null>(null)

  const openDownloadsOverlay = () => {
    setOverlay('downloads', true)
    refreshDownloads()
  }

  const closeDownloadsOverlay = () => {
    setContextMenu(null)
    setOverlay('downloads', false)
  }

  const openDownload = (download: DownloadEntry) => {
    if (download.state !== 'completed') return
    window.arcnext.downloads.openFile(download.id).then(refreshDownloads).catch(() => {})
  }

  const showInFinder = (download: DownloadEntry) => {
    window.arcnext.downloads.showInFinder(download.id).then(refreshDownloads).catch(() => {})
    setContextMenu(null)
  }

  const copyPath = (download: DownloadEntry) => {
    window.arcnext.downloads.copyPath(download.id).catch(() => {})
    setContextMenu(null)
  }

  const removeDownload = (download: DownloadEntry) => {
    window.arcnext.downloads.remove(download.id).then(refreshDownloads).catch(() => {})
    setContextMenu(null)
  }

  return (
    <div
      className={`downloads-tray${contextMenu ? ' downloads-menu-open' : ''}`}
      onMouseEnter={openDownloadsOverlay}
      onMouseLeave={closeDownloadsOverlay}
    >
      <button
        className={`downloads-button${downloads.length > 0 ? ' has-downloads' : ''}`}
        title="Downloads"
        onClick={() => window.arcnext.downloads.openFolder().then(refreshDownloads).catch(() => {})}
      >
        <DownloadsIcon />
      </button>

      {arrivingDownload && (
        <span
          key={downloadAnimationKey(arrivingDownload)}
          className="download-arrival"
          aria-hidden="true"
        >
          <span className="download-arrival-thumb">
            {arrivingDownload.thumbnailDataUrl ? (
              <img src={arrivingDownload.thumbnailDataUrl} alt="" />
            ) : (
              <FileIcon />
            )}
          </span>
        </span>
      )}

      {downloads.length > 0 && (
        <div className="downloads-popover" onClick={(e) => e.stopPropagation()}>
          <div className="downloads-list">
            {downloads.map((download) => {
              const progress = progressPercent(download)
              return (
                <button
                  key={download.id}
                  className={`download-item download-${download.state}`}
                  title={download.path}
                  aria-disabled={download.state !== 'completed'}
                  onClick={() => openDownload(download)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setContextMenu({ x: e.clientX, y: e.clientY, download })
                  }}
                >
                  <span className="download-thumb">
                    {download.thumbnailDataUrl ? (
                      <img src={download.thumbnailDataUrl} alt="" />
                    ) : (
                      <FileIcon />
                    )}
                  </span>
                  <span className="download-details">
                    <span className="download-name">{shortName(download.filename)}</span>
                    <span className="download-meta">{downloadSubtitle(download)}</span>
                    {progress !== null && (
                      <span className="download-progress" aria-hidden="true">
                        <span style={{ width: `${progress}%` }} />
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="ctx-menu downloads-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="ctx-menu-item"
            disabled={contextMenu.download.state !== 'completed'}
            onClick={() => showInFinder(contextMenu.download)}
          >
            Show in Finder
          </button>
          <button
            className="ctx-menu-item"
            onClick={() => copyPath(contextMenu.download)}
          >
            Copy Path
          </button>
          <button
            className="ctx-menu-item"
            onClick={() => removeDownload(contextMenu.download)}
          >
            Remove from List
          </button>
        </div>
      )}
    </div>
  )
}
