import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Gate from "./Gate.jsx";
import { AuthProvider } from "./lib/auth.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <Gate />
    </AuthProvider>
  </StrictMode>,
);
