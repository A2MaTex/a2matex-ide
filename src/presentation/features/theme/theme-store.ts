import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'a2matex.studio.theme';
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // storage unavailable: fall back to the default
  }
  return 'light';
}

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return darkQuery().matches ? 'dark' : 'light';
  return preference;
}

function apply(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
}

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Switch between light and dark (leaves "system" for an explicit choice). */
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const preference = readPreference();
  return {
    preference,
    resolved: resolve(preference),
    setPreference: (next) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // the choice still applies for this session
      }
      const resolved = resolve(next);
      apply(resolved);
      set({ preference: next, resolved });
    },
    toggle: () => get().setPreference(get().resolved === 'dark' ? 'light' : 'dark'),
  };
});

/** Apply the saved theme before the first render and follow the OS when the preference is "system". */
export function initTheme() {
  apply(useThemeStore.getState().resolved);
  darkQuery().addEventListener('change', () => {
    const { preference } = useThemeStore.getState();
    if (preference !== 'system') return;
    const resolved = resolve(preference);
    apply(resolved);
    useThemeStore.setState({ resolved });
  });
}
