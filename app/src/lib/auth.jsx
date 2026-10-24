import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { backendConfigured, supabase } from "./supabase.js";
import { createApi } from "./api.js";
import { demoEnabled } from "../demo/mode.js";

// status: demo (no backend configured), loading, signed-out, guest (anonymous, only for live games), needs-profile (signed in, first visit), ready.
// Practice never requires an account; signing in only unlocks the school features.
const AuthContext = createContext({ status: "demo", profile: null, api: null });
export const useAuth = () => useContext(AuthContext);

const realApi = supabase ? createApi(supabase) : null;
// Demo mode (?demo=1) swaps in an in-memory school; the real backend is never touched.
let api = demoEnabled ? null : realApi;

// Maps the database's error codes to something a person can act on.
export function claimMessage(err) {
  const m = String(err?.message ?? "");
  if (m.includes("school_not_found")) return "Tu correo no pertenece a un colegio registrado. Pide a tu colegio que se registre.";
  if (m.includes("bad_teacher_code")) return "Ese código de docente no es correcto.";
  return "No se pudo completar el ingreso. Inténtalo de nuevo.";
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: demoEnabled || backendConfigured ? "loading" : "demo", profile: null, user: null, error: null });

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user ?? null;
    if (!user) return setState({ status: "signed-out", profile: null, user: null, error: null });
    if (user.is_anonymous) return setState({ status: "guest", profile: null, user, error: null });
    try {
      const profile = await api.getProfile();
      setState({ status: profile ? "ready" : "needs-profile", profile, user, error: null });
    } catch (e) {
      setState({ status: "needs-profile", profile: null, user, error: e.message });
    }
  }, []);

  useEffect(() => {
    if (demoEnabled) {
      let alive = true;
      import("../demo/load.js")
        .then((m) => m.loadDemo())
        .then(({ client, profile }) => {
          api = createApi(client);
          if (alive) setState({ status: "ready", profile, user: { id: profile.id }, error: null });
        })
        .catch((e) => { if (alive) setState({ status: "signed-out", profile: null, user: null, error: e.message }); });
      return () => { alive = false; };
    }
    if (!supabase) return undefined;
    refresh();
    const { data } = supabase.auth.onAuthStateChange(() => { refresh(); });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...state,
      api,
      signInWithGoogle: () =>
        supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: "select_account" } },
        }),
      // A guest plays a live game with a nickname and keeps nothing: no profile, no school data.
      joinAsGuest: async () => {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      },
      signInWithMicrosoft: () =>
        supabase.auth.signInWithOAuth({
          provider: "azure",
          options: { scopes: "email", redirectTo: window.location.origin + window.location.pathname },
        }),
      claim: async ({ teacherCode, fullName }) => {
        const profile = await api.claimProfile({ teacherCode, fullName });
        setState((s) => ({ ...s, status: "ready", profile, error: null }));
      },
      signOut: async () => {
        if (demoEnabled) { window.location.search = ""; return; }
        await supabase.auth.signOut();
        setState({ status: "signed-out", profile: null, user: null, error: null });
      },
    }),
    [state],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
