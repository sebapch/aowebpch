import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { buildOptimizedMap } from "./mapExport";
import { getMapDir, mapExists } from "./mapSource";

/**
 * Servido en vivo de mapas para el cliente (`GET /maps/mapa_N.json`).
 *
 * El archivo estatico equivalente en `frontend/public/maps/` solo cambia con un
 * commit y un redeploy del frontend, asi que cualquier edicion del editor
 * quedaba invisible en `/play` hasta el siguiente deploy. Este endpoint sirve el
 * mismo formato compacto pero generado desde `mapas_source`, que es lo que el
 * editor acaba de escribir.
 *
 * Es publico y de solo lectura a proposito: expone exactamente los mismos bytes
 * que ya se sirven como archivo estatico a cualquiera que abra el juego.
 */

const MAP_ASSET_PATTERN = /^\/maps\/mapa_(\d+)\.json$/;

type CachedMap = {
    /** Firma de frescura: mtime mas alto de los archivos fuente del mapa. */
    sourceStamp: number;
    payload: string;
    etag: string;
};

const cacheByMapId = new Map<number, CachedMap>();

/** Archivos que alimentan el mapa compacto; `npcs.json` entra por el merge de spawns. */
const SOURCE_FILE_NAMES = ["terrain.json", "specials.json", "npcs.json"];

function readSourceStamp(mapId: number): number {
    let newest = 0;

    for (const fileName of SOURCE_FILE_NAMES) {
        try {
            const stats = fs.statSync(path.join(getMapDir(mapId), fileName));
            newest = Math.max(newest, stats.mtimeMs);
        } catch {
            // Archivo ausente: no aporta a la firma. `terrain.json` es el unico
            // obligatorio y su falta ya la corta `mapExists`.
        }
    }

    return newest;
}

export function isMapAssetRequest(url: string | undefined): boolean {
    if (!url) {
        return false;
    }

    return MAP_ASSET_PATTERN.test(url.split("?")[0]);
}

function sendJsonError(response: ServerResponse, status: number, message: string): void {
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify({ error: message }));
}

export function handleMapAssetRequest(request: IncomingMessage, response: ServerResponse): void {
    const method = (request.method ?? "GET").toUpperCase();

    if (method !== "GET" && method !== "HEAD") {
        sendJsonError(response, 405, `Metodo ${method} no permitido.`);
        return;
    }

    const match = (request.url ?? "").split("?")[0].match(MAP_ASSET_PATTERN);
    const mapId = Number.parseInt(match?.[1] ?? "", 10);

    if (!Number.isInteger(mapId) || mapId <= 0) {
        sendJsonError(response, 400, "Id de mapa invalido.");
        return;
    }

    if (!mapExists(mapId)) {
        sendJsonError(response, 404, `El mapa ${mapId} no existe.`);
        return;
    }

    try {
        const sourceStamp = readSourceStamp(mapId);
        let cached = cacheByMapId.get(mapId);

        if (!cached || cached.sourceStamp !== sourceStamp) {
            const payload = JSON.stringify(buildOptimizedMap(mapId));
            cached = {
                sourceStamp,
                payload,
                etag: `W/"${mapId}-${sourceStamp}-${payload.length}"`,
            };
            cacheByMapId.set(mapId, cached);
        }

        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("ETag", cached.etag);
        // El editor puede reescribir el mapa en cualquier momento: que el
        // proxy revalide siempre y se apoye en el ETag para no bajar 80 KB.
        response.setHeader("Cache-Control", "no-cache");

        if (request.headers["if-none-match"] === cached.etag) {
            response.statusCode = 304;
            response.end();
            return;
        }

        response.statusCode = 200;

        if (method === "HEAD") {
            response.setHeader("Content-Length", String(Buffer.byteLength(cached.payload)));
            response.end();
            return;
        }

        response.end(cached.payload);
    } catch (error) {
        console.error(`[MAPS] No se pudo servir el mapa ${mapId}:`, error);
        sendJsonError(response, 500, "No se pudo generar el mapa.");
    }
}

/** Invalida el cache de un mapa (o de todos). Lo usa el editor al guardar. */
export function clearMapAssetCache(mapId?: number): void {
    if (mapId === undefined) {
        cacheByMapId.clear();
        return;
    }

    cacheByMapId.delete(mapId);
}
