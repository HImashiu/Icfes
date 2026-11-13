// Prints a new VAPID key pair for the daily practice reminders (worker/growth.js, F34). Run once:
//   node scripts/vapid-keys.mjs
// then `npx wrangler secret put VAPID_PRIVATE_JWK` (the JSON line) and `npx wrangler secret put VAPID_PUBLIC`.
// Keep the private key only in Cloudflare. Changing the pair later means every subscriber has to subscribe again.
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
const b64u = (b) => Buffer.from(b).toString("base64url");
console.log("VAPID_PUBLIC=" + b64u(raw));
console.log("VAPID_PRIVATE_JWK=" + JSON.stringify({ kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x, y: jwk.y }));
