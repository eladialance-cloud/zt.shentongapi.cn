// 引导完成状态 store - 持久化到 localStorage

import { create } from 'zustand'

const ONBOARDING_KEY = 'onboarding_completed'

interface OnboardingState {
  completed: boolean
  setCompleted: (value: boolean) => void
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  completed: localStorage.getItem(ONBOARDING_KEY) === 'true',
  setCompleted: (value) => {
    localStorage.setItem(ONBOARDING_KEY, String(value))
    set({ completed: value })
  }
}))
