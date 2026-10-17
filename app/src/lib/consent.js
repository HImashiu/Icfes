// Consent texts and the version people accept. DRAFT: a lawyer must review these before real students use the app
// (Colombian data-protection law, Ley 1581 de 2012, and the rules for minors). Changing the version asks everyone again.
export const CONSENT_VERSION = "2026-10-borrador";

export const TERMS_TITLE = "Antes de empezar";
export const TERMS = [
  ["Qué datos usamos", "Tu nombre, el correo de tu colegio y tus respuestas en las prácticas y simulacros. No pedimos documento de identidad ni dirección."],
  ["Para qué", "Para guardar tu progreso, darte resultados y que tus docentes vean cómo va tu curso y qué temas reforzar."],
  ["Quién los ve", "Tus docentes y la coordinación de tu colegio. Otros colegios y otros estudiantes no ven tus datos."],
  ["Lo que no hacemos", "No vendemos tus datos ni mostramos publicidad. Los puntajes son orientativos: usan una clave de respuestas preliminar y no son resultados oficiales del ICFES."],
  ["Si eres menor de edad", "Tu colegio es responsable de contar con la autorización de tus acudientes para usar la plataforma."],
  ["Tus derechos", "Puedes pedir a tu colegio que consulte, corrija o elimine tus datos."],
];
export const GUARDIAN_TEXT =
  "El colegio declara que cuenta con la autorización de los padres o acudientes de sus estudiantes menores de edad para el tratamiento de sus datos en esta plataforma, y que atenderá las solicitudes de consulta, corrección o supresión.";

export const needsTerms = (consents) => !(consents ?? []).some((c) => c.kind === "terms" && c.version === CONSENT_VERSION);
export const hasGuardianAuth = (rows) => (rows ?? []).some((c) => c.kind === "guardian_authorization" && c.version === CONSENT_VERSION);
