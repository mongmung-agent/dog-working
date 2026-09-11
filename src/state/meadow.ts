import { atom } from 'jotai'
import type { MeadowController, MeadowUiState } from '../game/runtime'

export const meadowUiAtom = atom<MeadowUiState>({
  preferences: {
    theme: 'meadow',
    sound: false,
    music: 35,
    effects: 55,
    reduced: false,
    intro: false,
  },
  started: false,
  ready: false,
  tool: 'pet',
  callsOpen: false,
  ballPresent: false,
  toast: '',
  themeStatus: '마음에 드는 풍경을 골라 주세요.',
  themeLoading: false,
})

export const settingsOpenAtom = atom(false)
export const meadowControllerAtom = atom<MeadowController | null>(null)

export const toolsOpenAtom = atom(false)

export const emotionGuideOpenAtom = atom(false)
