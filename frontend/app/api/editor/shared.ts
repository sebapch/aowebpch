import { NextResponse } from "next/server";
import type { AuthSession } from "../../../lib/auth";
import { fetchApi, getSessionTokenFromCookie } from "../auth/shared";

/**
 * Puerta de entrada al editor de mapas.
 *
 * El navegador nunca habla con el servidor de juego: estas rutas validan la
 * sesion contra la api en cada peticion y recien ahi proxean al game server,
 * que es el unico proceso con acceso a `mapas_source`. El TOKEN_AUTH no sale
 * nunca del servidor de Next.
 */

const DEFAULT_GAME_SERVER_HTTP_URL = "http://127.0.0.1:7666";
const GAME_SERVER_TIMEOUT_MS = 30000;

export function getGameServerHttpUrl(): string {
    return process.env.GAME_SERVER_HTTP_URL?.trim() || DEFAULT_GAME_SERVER_HTTP_URL;
}

export type EditorAdmin = {
    accountName: string;
    characterName: string;
};

type AdminCheck = { ok: true; admin: EditorAdmin } | { ok: false; response: NextResponse };

/**
 * Exige una sesion valida cuya cuenta tenga al menos un personaje con
 * privilegios de administrador (`privileges === 1` en la api).
 */
export async function requireEditorAdmin(): Promise<AdminCheck> {
    const token = await getSessionTokenFromCookie();

    if (!token) {
        return {
            ok: false,
            response: NextResponse.json({ error: "Tu sesion no es valida o ya vencio." }, { status: 401 }),
        };
    }

    let session: AuthSession;

    try {
        const response = await fetchApi("/auth/session", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
        });

        if (!response.ok) {
            return {
                ok: false,
                response: NextResponse.json(
                    { error: "Tu sesion no es valida o ya vencio." },
                    { status: response.status === 401 ? 401 : 502 },
                ),
            };
        }

        session = (await response.json()) as AuthSession;
    } catch {
        return {
            ok: false,
            response: NextResponse.json({ error: "No se pudo validar la sesion." }, { status: 502 }),
        };
    }

    const adminCharacter = session.characters?.find((character) => character.isAdministrator);

    if (!adminCharacter) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: "Necesitas un personaje administrador para usar el editor." },
                { status: 403 },
            ),
        };
    }

    return {
        ok: true,
        admin: {
            accountName: session.account?.name ?? "",
            characterName: adminCharacter.name,
        },
    };
}

/** Proxea al game server agregando el secreto compartido y el actor. */
export async function forwardToGameServer(
    path: string,
    method: string,
    admin: EditorAdmin,
    body?: string,
): Promise<NextResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GAME_SERVER_TIMEOUT_MS);

    try {
        const response = await fetch(`${getGameServerHttpUrl()}${path}`, {
            method,
            headers: {
                Authorization: process.env.TOKEN_AUTH ?? "",
                "Content-Type": "application/json",
                "x-editor-actor": encodeURIComponent(admin.characterName),
            },
            body,
            cache: "no-store",
            signal: controller.signal,
        });

        const text = await response.text();

        return new NextResponse(text, {
            status: response.status,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            return NextResponse.json(
                { error: `El servidor de juego no respondio en ${GAME_SERVER_TIMEOUT_MS}ms.` },
                { status: 504 },
            );
        }

        return NextResponse.json(
            { error: "No se pudo contactar al servidor de juego. Verifica que este corriendo." },
            { status: 502 },
        );
    } finally {
        clearTimeout(timeoutId);
    }
}
