import { useEffect, useRef } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { EmotionGuideDialog } from './components/EmotionGuideDialog'
import { GameField } from './components/GameField'
import { FloatingControls, MeadowDock } from './components/MeadowControls'
import { SettingsDialog } from './components/SettingsDialog'
import { Symbols } from './components/Symbols'
import { WelcomeDialog } from './components/WelcomeDialog'
import { startMeadow } from './game/runtime'
import { meadowControllerAtom, meadowUiAtom, toolsOpenAtom } from './state/meadow'

export default function App() {
  const [toolsOpen, setToolsOpen] = useAtom(toolsOpenAtom)
  const initialized = useRef(false)
  const ui = useAtomValue(meadowUiAtom)
  const controller = useAtomValue(meadowControllerAtom)
  const setUi = useSetAtom(meadowUiAtom)
  const setController = useSetAtom(meadowControllerAtom)

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      setController(startMeadow(setUi))
    }
  }, [setController, setUi])
  useEffect(() => {
    document.body.classList.toggle('sound-on', ui.preferences.sound)
    document.body.classList.toggle('reduced', ui.preferences.reduced)
  }, [ui.preferences.reduced, ui.preferences.sound])

  return (
    <>
      <Symbols />
      <div
        id="app"
        onPointerDownCapture={event => {
          const target = event.target
          if (
            toolsOpen &&
            target instanceof Element &&
            !target.closest('.tool-controls,.tools-tab')
          )
            setToolsOpen(false)
          if (ui.callsOpen && target instanceof Element && !target.closest('#call-controls,#call'))
            controller?.closeCalls()
        }}
        onKeyDown={event => {
          if (event.key === 'Escape' && (ui.callsOpen || toolsOpen)) {
            setToolsOpen(false)
            event.preventDefault()
            controller?.closeCalls()
          }
        }}
      >
        <FloatingControls />
        <GameField />
        <MeadowDock />
        <WelcomeDialog />
      </div>
      <SettingsDialog />
      <EmotionGuideDialog />
    </>
  )
}
