import type { AgentStatus } from '../../shared/types'

interface AgentIndicatorProps {
  status: AgentStatus
}

export default function AgentIndicator({ status }: AgentIndicatorProps) {
  if (status === 'thinking') {
    return (
      <span className="agent-indicator agent-thinking" title="Agent working">
        {[...Array(9)].map((_, i) => (
          <span key={i} className="agent-dot" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </span>
    )
  }

  // idle
  return (
    <span className="agent-indicator agent-idle" title="Agent ready">
      {[...Array(9)].map((_, i) => (
        <span key={i} className="agent-dot" />
      ))}
    </span>
  )
}
