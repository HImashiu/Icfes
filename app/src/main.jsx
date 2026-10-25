import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./lib/auth.jsx";
import DemoBanner from "./demo/DemoBanner.jsx";
import { demoEnabled } from "./demo/mode.js";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      {demoEnabled && <DemoBanner />}
      <App />
    </AuthProvider>
  </StrictMode>,
);
