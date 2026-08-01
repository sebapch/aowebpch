import { NextResponse } from "next/server";
import type { AuthSession } from "../../../lib/auth";
import { getApiBaseUrl } from "../../../lib/api-base-url";
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

    const administrator = session.characters?.find(
        (character) => character.isAdministrator,
    );

    if (!administrator) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: "No tienes permisos de administrador." },
                { status: 403 },
            ),
        };
    }

    return {
        ok: true,
        admin: {
            accountName: session.account?.name ?? "",
            characterName: administrator.name,
        },
    };
}

/**
 * Proxea a los endpoints `/admin/game-data/*` de la api (plantillas de NPCs y
 * objetos, en Postgres). Distinto del gate del editor: la api exige ademas
 * que la cuenta logueada sea la cuenta admin de datos de juego configurada
 * (`GAME_DATA_ADMIN_ACCOUNT_ID`/`GAME_DATA_ADMIN_EMAIL`), no alcanza con ser
 * administrador de personaje. Si no esta configurada, la api devuelve 403.
 */
export async function forwardToGameDataApi(path: string, method: string, body?: string): Promise<NextResponse> {
    const token = await getSessionTokenFromCookie();

    if (!token) {
        return NextResponse.json({ error: "Tu sesion no es valida o ya vencio." }, { status: 401 });
    }

    const proxyToken = process.env.GAME_DATA_ADMIN_PROXY_TOKEN || "enabled";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GAME_SERVER_TIMEOUT_MS);

    try {
        const response = await fetch(`${getApiBaseUrl()}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                "x-game-data-admin-token": proxyToken,
                "Content-Type": "application/json",
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
                { error: `La api no respondio en ${GAME_SERVER_TIMEOUT_MS}ms.` },
                { status: 504 },
            );
        }

        return NextResponse.json(
            { error: "No se pudo contactar a la api. Verifica que este corriendo." },
            { status: 502 },
        );
    } finally {
        clearTimeout(timeoutId);
    }
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
