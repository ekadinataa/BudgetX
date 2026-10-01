import { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext();

/**
 * ThemeProvider — writes the appearance attributes onto <html>.
 *
 * The design system is driven entirely by four data attributes, so this
 * component owns nothing but the mapping from React state to DOM:
 *
 *   data-theme      light | dark
 *   data-density    compact | standard | relaxed   → --density-scale
 *   data-radius     sharp | soft | round          → --radius-scale
 *   data-collapsed  true                          → collapses the nav rail
 *
 * Colour values live in src/styles/tokens.css. Nothing here injects custom
 * properties inline: that would pin them as inline styles and defeat the
 * stylesheet, and it used to require the same palette to be duplicated in
 * three places.
 *
 * @param {Object} props
 * @param {boolean} props.darkMode - whether dark theme is active
 * @param {Function} props.setDarkMode - state setter for toggling theme
 * @param {string} [props.density='standard']
 * @param {string} [props.radius='soft']
 * @param {boolean} [props.collapsed=false]
 * @param {React.ReactNode} props.children
 */
export function ThemeProvider({
  darkMode,
  setDarkMode,
  density = 'standard',
  radius = 'soft',
  collapsed = false,
  children,
}) {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    root.setAttribute('data-density', density);
    root.setAttribute('data-radius', radius);
    if (collapsed) {
      root.setAttribute('data-collapsed', 'true');
    } else {
      root.removeAttribute('data-collapsed');
    }
  }, [darkMode, density, radius, collapsed]);

  return (
    <ThemeContext.Provider value={{ darkMode, setDarkMode, density, radius, collapsed }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * useTheme — convenience hook for consuming ThemeContext.
 * @returns {{ darkMode: boolean, setDarkMode: Function, density: string, radius: string, collapsed: boolean }}
 */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}

export default ThemeContext;
