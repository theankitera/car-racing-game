import { Component, useEffect, type ReactNode } from 'react'
import { audio } from './game/audio'
import { clearInputs, initInput, setInputEnabled } from './game/input'
import { useGame, type Screen } from './game/store'
import { TRACKS } from './game/tracks'
import { Race } from './screens/Race'
import { Garage } from './ui/Garage'
import { HowTo } from './ui/HowTo'
import { LevelSelect } from './ui/LevelSelect'
import { MainMenu } from './ui/MainMenu'
import { SettingsPanel } from './ui/SettingsPanel'

export default function App() {
  const screen = useGame((s) => s.screen)
  const sound = useGame((s) => s.settings.sound)
  const volume = useGame((s) => s.settings.volume)

  useEffect(() => initInput(), [])

  // Deep links: #race/sunset-bay, #garage, #settings … Handy for sharing a
  // circuit with someone and for driving the app from an automated browser.
  useEffect(() => {
    const hash = window.location.hash.replace(/^#\/?/, '')
    if (!hash) return
    const [route, arg] = hash.split('/')
    const store = useGame.getState()
    if (route === 'race' && arg && TRACKS.some((t) => t.id === arg)) {
      store.startRace(arg)
      return
    }
    if (['menu', 'garage', 'levels', 'settings', 'howto'].includes(route)) {
      store.setScreen(route as Screen)
    }
  }, [])

  // Browsers only allow audio after the first real interaction.
  useEffect(() => {
    const resume = () => audio.resume()
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
    return () => {
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
    }
  }, [])

  useEffect(() => {
    audio.setVolume(volume)
    audio.setEnabled(sound)
  }, [sound, volume])

  // Driving keys are only captured during a race so menus stay scrollable.
  useEffect(() => {
    const racing = screen === 'race'
    setInputEnabled(racing)
    if (!racing) clearInputs()
  }, [screen])

  return (
    <ErrorBoundary>
      {screen === 'menu' && <MainMenu />}
      {screen === 'garage' && <Garage />}
      {screen === 'levels' && <LevelSelect />}
      {screen === 'settings' && <SettingsPanel />}
      {screen === 'howto' && <HowTo />}
      {screen === 'race' && <Race />}
    </ErrorBoundary>
  )
}

interface BoundaryState {
  error: Error | null
}

/** Keeps a runtime error from leaving the player staring at a blank page. */
class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="loading">
        <div style={{ fontSize: 34 }}>🏳️</div>
        <h2 style={{ letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: 14 }}>
          Something went wrong
        </h2>
        <p style={{ color: 'var(--muted)', maxWidth: 460, textAlign: 'center', fontSize: 13 }}>
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          className="btn primary"
          onClick={() => {
            this.setState({ error: null })
            useGame.getState().setScreen('menu')
          }}
        >
          Back to the menu
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            try {
              localStorage.removeItem('apex-nitro-save')
            } catch {
              /* ignore */
            }
            window.location.reload()
          }}
        >
          Reset save and reload
        </button>
      </div>
    )
  }
}
