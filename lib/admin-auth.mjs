// Acceso al administrador con una cuenta de Google autorizada.
// El navegador obtiene un token firmado por Google; el servidor verifica la firma,
// el destinatario y el correo, y guarda una sesión firmada en una cookie.

// Correos que pueden entrar al administrador.
export const ADMIN_EMAILS = ["matudaddona@gmail.com"];

// ID de cliente web de Google (Google Cloud Console → Credenciales → ID de cliente de OAuth).
// No es secreto. También se puede definir con la variable de entorno GOOGLE_CLIENT_ID.
export const GOOGLE_CLIENT_ID =
    "697283134798-ert7aal7ah8l65cdic1q3l2vmnvdqfk6.apps.googleusercontent.com";

export const SESSION_COOKIE = "trama_admin";
const SESSION_DAYS = 7;
const GOOGLE_KEYS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export class AuthError extends Error {
    constructor(message, status = 401) {
        super(message);
        this.status = status;
    }
}

export const isAuthorized = (email) =>
    ADMIN_EMAILS.includes(String(email || "").trim().toLowerCase());

const encoder = new TextEncoder();
function base64UrlToBytes(value) {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function bytesToBase64Url(bytes) {
    let bin = "";
    for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const decodeJson = (part) => JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));

// Claves públicas de Google, en memoria hasta que vencen.
let keyCache = { keys: null, until: 0 };
async function googleKeys(fetchKeys) {
    if (fetchKeys) return fetchKeys();
    if (keyCache.keys && Date.now() < keyCache.until) return keyCache.keys;
    const response = await fetch(GOOGLE_KEYS_URL);
    if (!response.ok) throw new AuthError("No se pudo validar el acceso con Google.", 503);
    const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") || "")?.[1]);
    const { keys } = await response.json();
    keyCache = { keys, until: Date.now() + (Number.isFinite(maxAge) ? maxAge : 3600) * 1000 };
    return keys;
}

// Verifica un ID token de Google y devuelve el correo verificado.
export async function verifyGoogleCredential(credential, clientId, { fetchKeys, now = Date.now() } = {}) {
    if (!clientId) throw new AuthError("El acceso con Google todavía no está configurado.", 503);
    const parts = String(credential || "").split(".");
    if (parts.length !== 3) throw new AuthError("El inicio de sesión no es válido.");
    let header, claims;
    try {
        header = decodeJson(parts[0]);
        claims = decodeJson(parts[1]);
    } catch {
        throw new AuthError("El inicio de sesión no es válido.");
    }
    if (header.alg !== "RS256" || !header.kid) throw new AuthError("El inicio de sesión no es válido.");
    const jwk = (await googleKeys(fetchKeys)).find((k) => k.kid === header.kid);
    if (!jwk) throw new AuthError("El inicio de sesión no es válido.");
    const key = await crypto.subtle.importKey(
        "jwk",
        { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
    );
    const valid = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        base64UrlToBytes(parts[2]),
        encoder.encode(parts[0] + "." + parts[1]),
    );
    if (!valid) throw new AuthError("El inicio de sesión no es válido.");
    const seconds = Math.floor(now / 1000);
    if (!GOOGLE_ISSUERS.has(claims.iss)) throw new AuthError("El inicio de sesión no es válido.");
    if (claims.aud !== clientId) throw new AuthError("El inicio de sesión no es válido.");
    if (!Number.isFinite(claims.exp) || claims.exp < seconds - 60)
        throw new AuthError("El inicio de sesión venció. Volvé a intentar.");
    if (claims.email_verified !== true && claims.email_verified !== "true")
        throw new AuthError("La cuenta de Google no tiene el correo verificado.", 403);
    return { email: String(claims.email).toLowerCase(), name: claims.name || claims.email };
}

async function hmac(secret, data) {
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    return bytesToBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}
function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export async function createSession(user, secret, now = Date.now()) {
    if (!secret) throw new AuthError("Falta configurar la clave de sesión del administrador.", 503);
    const payload = bytesToBase64Url(
        encoder.encode(
            JSON.stringify({ email: user.email, name: user.name, exp: now + SESSION_DAYS * 864e5 }),
        ),
    );
    return payload + "." + (await hmac(secret, payload));
}

// Devuelve el usuario de la cookie si la firma es válida, no venció y sigue autorizado.
export async function readSession(cookieHeader, secret, now = Date.now()) {
    if (!secret) return null;
    const raw = String(cookieHeader || "")
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(SESSION_COOKIE + "="))
        ?.slice(SESSION_COOKIE.length + 1);
    if (!raw) return null;
    const [payload, signature] = raw.split(".");
    if (!payload || !signature || !safeEqual(signature, await hmac(secret, payload))) return null;
    try {
        const session = decodeJson(payload);
        if (!session.exp || session.exp < now || !isAuthorized(session.email)) return null;
        return { email: session.email, name: session.name || session.email };
    } catch {
        return null;
    }
}

export function sessionCookie(value, secure) {
    return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}
export function clearSessionCookie(secure) {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}
