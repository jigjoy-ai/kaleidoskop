import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import "./index.css"
import App from "./App.tsx"
import { initAnalytics } from "./lib/analytics"

initAnalytics()

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter>
			<Routes>
				{/* Root → featured demo run. `smoke-test` is a magic id the
				    backend resolves to the sample log shipped with the
				    repo (packages/backend/samples/demo.jsonl). This makes
				    the landing page a live replay, not a scripted demo. */}
				<Route path="/" element={<Navigate to="/r/smoke-test" replace />} />
				<Route path="/r/:id" element={<App />} />
				<Route path="*" element={<App />} />
			</Routes>
		</BrowserRouter>
	</StrictMode>,
)
