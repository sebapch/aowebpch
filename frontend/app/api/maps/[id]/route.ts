import { NextResponse } from "next/server";
import { getGameServerHttpUrl } from "../../../../lib/game-server-url";

/**
 * Mapa en vivo: proxy de solo lectura hacia `GET /maps/mapa_N.json` del servidor
 * de juego, que es el unico proceso con `mapas_source` y por lo tanto el unico
 * que ve lo que el editor acaba de guardar.
 *
 * El cliente lo pide antes que el archivo estatico de `public/maps/`, que solo
 * cambia con un redeploy. Si el servidor de juego no responde, devolvemos error
 * y `loadMapData` cae al estatico: el juego nunca depende de este endpoint.
 *
 * Sin sesion ni token: son exactamente los mismos bytes que ya se sirven como
 * archivo estatico publico. El TOKEN_AUTH no entra aca justamente porque no
 * hace falta, y el timeout es corto para no colgar la carga de un mapa.
 */

const GAME_SERVER_TIMEOUT_MS = 4000;

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
    const { id } = await context.params;
    const mapId = Number.parseInt(id, 10);

    if (!Number.isInteger(mapId) || mapId <= 0 || String(mapId) !== id) {
        return NextResponse.json({ error: "Id de mapa invalido." }, { status: 400 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GAME_SERVER_TIMEOUT_MS);

    try {
        const incomingEtag = request.headers.get("if-none-match");
        const response = await fetch(`${getGameServerHttpUrl()}/maps/mapa_${mapId}.json`, {
            headers: incomingEtag ? { "If-None-Match": incomingEtag } : undefined,
            cache: "no-store",
            signal: controller.signal,
        });

        const etag = response.headers.get("etag");
        const headers: Record<string, string> = {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-cache",
        };

        if (etag) {
            headers.ETag = etag;
        }

        if (response.status === 304) {
            return new NextResponse(null, { status: 304, headers });
        }

        return new NextResponse(await response.text(), {
            status: response.status,
            headers,
        });
    } catch (error) {
        const timedOut = error instanceof Error && error.name === "AbortError";

        return NextResponse.json(
            {
                error: timedOut
                    ? `El servidor de juego no respondio en ${GAME_SERVER_TIMEOUT_MS}ms.`
                    : "No se pudo contactar al servidor de juego.",
            },
            { status: 504, headers: { "Cache-Control": "no-store" } },
        );
    } finally {
        clearTimeout(timeoutId);
    }
}
