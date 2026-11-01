import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The app's own fonts for the scripts of the 10 Indian languages (Noto Sans, SIL Open Font License), served with the app:
// a station PC without a font for a script would otherwise show empty boxes (tests/e2e/test_indian_scripts.py). Each
// file covers one script (unicode-range), so a browser fetches only the scripts on the screen.
import '@fontsource-variable/noto-sans-devanagari/wght.css'
import '@fontsource-variable/noto-sans-bengali/wght.css'
import '@fontsource-variable/noto-sans-gurmukhi/wght.css'
import '@fontsource-variable/noto-sans-gujarati/wght.css'
import '@fontsource-variable/noto-sans-oriya/wght.css'
import '@fontsource-variable/noto-sans-tamil/wght.css'
import '@fontsource-variable/noto-sans-telugu/wght.css'
import '@fontsource-variable/noto-sans-kannada/wght.css'
import '@fontsource-variable/noto-sans-malayalam/wght.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
