// The link a student scans to join a live room: the app opens on the join screen with the code already filled in.
// Hash routing, like the other links (#presentacion, #informe/…), so the hosted site needs no server rule.

export const joinHash = (code) => `#en-vivo=${code}`;

export const joinUrl = (code, { origin, pathname } = window.location) => `${origin}${pathname}${joinHash(code)}`;

// The six-digit code from a join link, or "" when the hash is not one.
export const joinCodeFromHash = (hash) => /^#en-vivo=(\d{6})$/.exec(hash ?? "")?.[1] ?? "";
