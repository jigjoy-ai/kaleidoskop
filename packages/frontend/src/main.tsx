import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import "./index.css"
import App from "./App.tsx"
import LandingPage from "./LandingPage.tsx"

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter>
			<Routes>
				{/* Landing page with two CTAs — "See demo run" navigates to
				    /r/smoke-test, "Upload baro audit log" opens the file
				    picker. Drag-and-drop works anywhere thanks to the
				    window-level listener inside DropZone. */}
				<Route path="/" element={<LandingPage />} />
				<Route path="/r/:id" element={<App />} />
				<Route path="*" element={<App />} />
			</Routes>
		</BrowserRouter>
	</StrictMode>,
)
