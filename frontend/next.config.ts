import { execSync } from "node:child_process";
import type { NextConfig } from "next";

function resolveBuildId(): string {
    if (process.env.NEXT_BUILD_ID?.trim()) {
        return process.env.NEXT_BUILD_ID.trim();
    }

    try {
        return execSync("git rev-parse --short=12 HEAD", {
            encoding: "utf8",
        }).trim();
    } catch {
        return "development";
    }
}

const buildId = resolveBuildId();
const isDev = process.env.NODE_ENV !== "production";

/**
 * CSP del sitio. `script-src` necesita `unsafe-inline` porque Next inyecta el
 * bootstrap de hidratacion inline y no usamos middleware con nonce; sirve como
 * defensa en profundidad, no como blindaje total contra XSS. `connect-src`
 * deja `ws:`/`wss:` abiertos porque la URL del servidor de juego la elige el
 * usuario en la pantalla de conexion.
 */
function buildContentSecurityPolicy(): string {
    const scriptSrc = ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
        .filter(Boolean)
        .join(" ");

    return [
        "default-src 'self'",
        `script-src ${scriptSrc}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' https: ws: wss:",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        // Solo en produccion: en dev el juego se conecta por ws:// al server
        // local y no queremos que el navegador lo fuerce a wss://.
        isDev ? "" : "upgrade-insecure-requests",
    ]
        .filter(Boolean)
        .join("; ");
}

const securityHeaders = [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy() },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
    },
    {
        // El chat de voz de retos usa el microfono; el resto va cerrado.
        key: "Permissions-Policy",
        value: "camera=(), geolocation=(), microphone=(self), interest-cohort=()",
    },
];

const nextConfig: NextConfig = {
    allowedDevOrigins: [
        "127.0.0.1",
        "localhost",
        "*.trycloudflare.com",
        "trycloudflare.com",
    ],
    env: {
        NEXT_PUBLIC_NEXT_BUILD_ID: buildId,
    },
    generateBuildId: async () => buildId,
    async headers() {
        return [{ source: "/:path*", headers: securityHeaders }];
    },
};

export default nextConfig;
