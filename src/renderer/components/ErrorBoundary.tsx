import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: 'app' | 'pane'
  onReset?: () => void
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private reset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    if (!this.state.error) return this.props.children

    if (this.props.fallback === 'pane') {
      return (
        <div className="error-boundary-pane">
          <span className="error-boundary-icon">⚠</span>
          <p>This pane crashed</p>
          <p className="error-boundary-detail">{this.state.error.message}</p>
          <button onClick={this.reset}>Retry</button>
        </div>
      )
    }

    return (
      <div className="error-boundary-app">
        <span className="error-boundary-icon">⚠</span>
        <h2>Something went wrong</h2>
        <p className="error-boundary-detail">{this.state.error.message}</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    )
  }
}
