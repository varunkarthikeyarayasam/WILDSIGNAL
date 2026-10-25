import { Component, type ErrorInfo, type ReactNode } from 'react'
import { MapPinOff } from 'lucide-react'

type State = { failed: boolean; message: string }

/**
 * Keeps a map start-up failure (for example a browser without WebGL2) from unmounting the whole application.
 * The observation index, details, filters, history, export and methodology stay available; only the map is replaced
 * by an honest unavailable state with a retry.
 */
export class MapBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, message: '' }

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, message: error instanceof Error ? error.message : 'The map could not start.' }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn('[WILDSIGNAL] The map failed to start.', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <div className="map-fallback" role="alert">
      <span className="map-fallback-icon"><MapPinOff size={20} /></span>
      <b>The interactive map could not start</b>
      <p>The map needs WebGL2, which this browser or device has not made available. Nothing is hidden or simulated: the observation index, record details, filters, Activity History and CSV export continue to work from the same data.</p>
      <small>{this.state.message.split('\n')[0]}</small>
      <button className="button button-dark" onClick={() => this.setState({ failed: false, message: '' })}>Try again</button>
    </div>
  }
}
