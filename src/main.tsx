import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Analytics } from "@vercel/analytics/react"

console.log("Analytics import:", Analytics);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Analytics debug={true} />
    <SpeedInsights />
    <App />
  </StrictMode>,
)
