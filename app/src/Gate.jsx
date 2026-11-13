import { useEffect } from "react";
import App from "./App.jsx";
import { demoEnabled } from "./demo/mode.js";
import { bootGrowth } from "./lib/growth/app.js";
import Login from "./screens/Login.jsx";
import { useAuth } from "./lib/auth.jsx";
import { restoreReturnHash } from "./lib/access.js";
import { tokenFromHash } from "./lib/family.js";
import Loading from "./components/Loading.jsx";

// The app opens only with an account. Before that, the sign-in is the whole page.
// Exceptions: family report links (parents have no account) and a build with no backend (local development).
export default function Gate() {
  const auth = useAuth();
  // Growth (docs/growth/LEDGER.md): error reporting, app:open, and an invitation in the address kept for after sign-in.
  useEffect(() => { if (!demoEnabled) bootGrowth(); }, []);
  const open = auth.status === "ready" || auth.status === "needs-profile" || auth.status === "demo" || auth.status === "guest";
  if (typeof window !== "undefined" && tokenFromHash(window.location.hash)) return <App />;
  if (auth.status === "loading") return <Loading page label="Cargando…" />;
  if (!open) return <div className="app"><Login gate /></div>;
  return <AppAfterRestore />;
}

// Back from Google: put back the #… the visitor came with (a live-game code, #docente…) before App reads it.
function AppAfterRestore() {
  restoreReturnHash();
  return <App />;
}
