import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Analytics } from "@vercel/analytics/react"

console.log("Analytics import:", Analytics);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Analytics beforeSend={(event) => {
      console.log("Envoi d'un événement Analytics...", event);
      return event;
    }} />
    <SpeedInsights />
    <App />
  </StrictMode>,
)
