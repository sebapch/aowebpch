import type { IncomingMessage, ServerResponse } from "node:http";
import config = require("./config");
import {
    FRONTEND_MAPS_DIR,
    MAPS_SOURCE_DIR,
    API_MAPS_SOURCE_DIR,
    type EditorMapBundle,
    type MapNpcPlacement,
    listMapSummaries,
    mapExists,
    readMapBundle,
    getActiveMapIds,
    setActiveMapIds,
} from "./mapSource";
import { type CreateMapInput, createMap, linkMapEdge, saveMapBundle, saveMapNpcs } from "./mapWrites";
import { MAP_SIDES, type MapSide } from "./mapEdges";
import fs from "node:fs";
import vars = require("./vars");

/**
 * API HTTP del editor de mapas, montada sobre el mismo `http.Server` que ya usa
 * el websocket del juego. Este proceso es el unico que tiene el filesystem de
 * `mapas_source` y el estado vivo del mundo, asi que es el unico que puede
 * leer, escribir y recargar mapas.
 *
 * El navegador nunca llega hasta aca: el frontend de Next hace de proxy,
 * valida la sesion del usuario contra la api y agrega el TOKEN_AUTH.
 */

const EDITOR_PREFIX = "/editor/";

type EditorRoute = {
    method: string;
    pattern: RegExp;
    handler: (params: string[], body: unknown) => Promise<unknown> | unknown;
};

export class EditorHttpError extends Error {
    status: number;
    issues?: string[];

    constructor(status: number, message: string, issues?: string[]) {
        super(message);
        this.name = "EditorHttpError";
        this.status = status;
        this.issues = issues;
    }
}

export function isEditorRequest(url: string | undefined): boolean {
    if (!url) {
        return false;
    }

    const pathname = url.split("?")[0];

    return pathname === "/editor" || pathname.startsWith(EDITOR_PREFIX);
}

function parseMapId(raw: string): number {
    const mapId = Number.parseInt(raw, 10);

    if (!Number.isInteger(mapId) || mapId <= 0) {
        throw new EditorHttpError(400, `Id de mapa invalido: ${raw}`);
    }

    return mapId;
}

function requireMapBundle(body: unknown): EditorMapBundle {
    if (!body || typeof body !== "object") {
        throw new EditorHttpError(400, "Se esperaba un bundle de mapa.");
    }

    const candidate = body as Partial<EditorMapBundle>;

    if (!candidate.meta || !Array.isArray(candidate.tiles) || typeof candidate.width !== "number" || typeof candidate.height !== "number") {
        throw new EditorHttpError(400, "El bundle de mapa tiene forma invalida.");
    }

    return candidate as EditorMapBundle;
}

function requireNpcPlacements(body: unknown): MapNpcPlacement[] {
    if (!Array.isArray(body)) {
        throw new EditorHttpError(400, "Se esperaba un array de spawns de NPC.");
    }

    return body as MapNpcPlacement[];
}

/**
 * Guardar solo escribe a disco: el mundo en memoria sigue con la copia vieja.
 * Si el mapa esta activo lo recargamos por el mismo camino que usa el toggle,
 * que resetea su estado runtime (items tirados, instancias de NPC).
 */
async function reloadIfActive(mapId: number): Promise<boolean> {
    const loadMapsInstance = (vars as any).loadMapsInstance;

    if (!loadMapsInstance || !getActiveMapIds().includes(mapId)) {
        return false;
    }

    try {
        await loadMapsInstance.loadSingleMap(mapId);
        return true;
    } catch (error) {
        console.error(`[EDITOR] No se pudo recargar el mapa ${mapId}:`, error);
        return false;
    }
}

const routes: EditorRoute[] = [
    {
        method: "GET",
        pattern: /^\/editor\/health$/,
        handler: () => ({
            ok: true,
            editorEnabled: config.editorEnabled,
            nodeEnv: config.nodeEnv,
            writesAllowed: config.nodeEnv !== "production" || config.editorAllowProduction,
            sinks: {
                source: fs.existsSync(MAPS_SOURCE_DIR),
                api: fs.existsSync(API_MAPS_SOURCE_DIR),
                frontendMaps: fs.existsSync(FRONTEND_MAPS_DIR),
            },
        }),
    },
    {
        method: "GET",
        pattern: /^\/editor\/maps$/,
        handler: () => ({ maps: listMapSummaries(), activeMapIds: getActiveMapIds() }),
    },
    {
        method: "POST",
        pattern: /^\/editor\/maps$/,
        handler: (_params, body) => {
            try {
                return { bundle: createMap((body ?? {}) as CreateMapInput) };
            } catch (error) {
                throw new EditorHttpError(400, error instanceof Error ? error.message : "No se pudo crear el mapa.");
            }
        },
    },
    {
        method: "GET",
        pattern: /^\/editor\/active-maps$/,
        handler: () => ({ activeMapIds: getActiveMapIds() }),
    },
    {
        method: "POST",
        pattern: /^\/editor\/active-maps\/toggle$/,
        handler: async (_params, body) => {
            const payload = body as { mapId?: number; active?: boolean };
            const mapId = parseMapId(String(payload?.mapId));
            const active = Boolean(payload?.active);

            if (!mapExists(mapId)) {
                throw new EditorHttpError(404, `El mapa ${mapId} no existe.`);
            }

            const currentActiveIds = getActiveMapIds();
            let newActiveIds: number[];

            if (active) {
                newActiveIds = Array.from(new Set([...currentActiveIds, mapId]));
                if ((vars as any).loadMapsInstance) {
                    await (vars as any).loadMapsInstance.loadSingleMap(mapId);
                }
            } else {
                newActiveIds = currentActiveIds.filter((id) => id !== mapId);
                if ((vars as any).loadMapsInstance) {
                    (vars as any).loadMapsInstance.unloadMap(mapId);
                }
            }

            setActiveMapIds(newActiveIds);

            return { ok: true, mapId, active, activeMapIds: newActiveIds };
        },
    },
    {
        method: "GET",
        pattern: /^\/editor\/maps\/(\d+)$/,
        handler: (params) => {
            const mapId = parseMapId(params[0]);

            if (!mapExists(mapId)) {
                throw new EditorHttpError(404, `El mapa ${mapId} no existe.`);
            }

            return readMapBundle(mapId);
        },
    },
    {
        method: "PUT",
        pattern: /^\/editor\/maps\/(\d+)$/,
        handler: async (params, body) => {
            const mapId = parseMapId(params[0]);

            if (!mapExists(mapId)) {
                throw new EditorHttpError(404, `El mapa ${mapId} no existe.`);
            }

            let bundle: EditorMapBundle;

            try {
                bundle = saveMapBundle(mapId, requireMapBundle(body));
            } catch (error) {
                throw new EditorHttpError(400, error instanceof Error ? error.message : "No se pudo guardar el mapa.");
            }

            return { bundle, reloaded: await reloadIfActive(mapId) };
        },
    },
    {
        method: "POST",
        pattern: /^\/editor\/maps\/(\d+)\/edges$/,
        handler: async (params, body) => {
            const mapId = parseMapId(params[0]);
            const payload = (body ?? {}) as { side?: string; neighborMapId?: number | null };
            const side = payload.side as MapSide;

            if (!MAP_SIDES.includes(side)) {
                throw new EditorHttpError(400, `Borde invalido: ${payload.side}. Validos: ${MAP_SIDES.join(", ")}.`);
            }

            const neighborMapId =
                payload.neighborMapId === null || payload.neighborMapId === undefined
                    ? null
                    : parseMapId(String(payload.neighborMapId));

            let result;

            try {
                result = linkMapEdge(mapId, side, neighborMapId);
            } catch (error) {
                throw new EditorHttpError(400, error instanceof Error ? error.message : "No se pudo conectar el borde.");
            }

            // Cada mapa reescrito puede estar vivo en memoria; recargamos todos.
            const reloadedMapIds: number[] = [];

            for (const writtenMapId of result.writtenMapIds) {
                if (await reloadIfActive(writtenMapId)) {
                    reloadedMapIds.push(writtenMapId);
                }
            }

            return { ...result, bundle: readMapBundle(mapId), reloadedMapIds };
        },
    },
    {
        method: "PUT",
        pattern: /^\/editor\/maps\/(\d+)\/npcs$/,
        handler: async (params, body) => {
            const mapId = parseMapId(params[0]);

            if (!mapExists(mapId)) {
                throw new EditorHttpError(404, `El mapa ${mapId} no existe.`);
            }

            let spawns: MapNpcPlacement[];

            try {
                spawns = saveMapNpcs(mapId, requireNpcPlacements(body));
            } catch (error) {
                throw new EditorHttpError(400, error instanceof Error ? error.message : "No se pudieron guardar los spawns.");
            }

            return { spawns, reloaded: await reloadIfActive(mapId) };
        },
    },
];

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(body);
}

const MAX_BODY_BYTES = 16 * 1024 * 1024;

function readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;

        request.on("data", (chunk: Buffer) => {
            size += chunk.length;

            if (size > MAX_BODY_BYTES) {
                reject(new EditorHttpError(413, "El cuerpo de la peticion es demasiado grande."));
                request.destroy();
                return;
            }

            chunks.push(chunk);
        });
        request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        request.on("error", (error) => reject(error));
    });
}

export async function handleEditorRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
        if (!config.editorEnabled) {
            throw new EditorHttpError(404, "El editor de mapas esta deshabilitado.");
        }

        if (request.headers.authorization !== config.tokenAuth) {
            throw new EditorHttpError(401, "No autorizado.");
        }

        const pathname = (request.url ?? "").split("?")[0];
        const method = (request.method ?? "GET").toUpperCase();

        const matchedPath = routes.filter((route) => route.pattern.test(pathname));

        if (matchedPath.length === 0) {
            throw new EditorHttpError(404, `Ruta desconocida: ${pathname}`);
        }

        const route = matchedPath.find((candidate) => candidate.method === method);

        if (!route) {
            throw new EditorHttpError(405, `Metodo ${method} no permitido en ${pathname}`);
        }

        const params = (pathname.match(route.pattern) ?? []).slice(1);
        const isWrite = method !== "GET";

        if (isWrite && config.nodeEnv === "production" && !config.editorAllowProduction) {
            throw new EditorHttpError(
                403,
                "El editor es de solo lectura en produccion. Activa EDITOR_ALLOW_PRODUCTION para permitir escrituras.",
            );
        }

        if (isWrite) {
            const rawActor = request.headers["x-editor-actor"];
            const actor = typeof rawActor === "string" ? decodeURIComponent(rawActor) : "desconocido";
            console.log(`[EDITOR] ${method} ${pathname} actor=${actor}`);
        }

        let body: unknown = undefined;

        if (isWrite) {
            const raw = await readBody(request);

            if (raw.trim()) {
                try {
                    body = JSON.parse(raw);
                } catch {
                    throw new EditorHttpError(400, "El cuerpo de la peticion no es JSON valido.");
                }
            }
        }

        sendJson(response, 200, await route.handler(params, body));
    } catch (error) {
        if (error instanceof EditorHttpError) {
            sendJson(response, error.status, { error: error.message, issues: error.issues });
            return;
        }

        console.error("[EDITOR] Error no controlado:", error);
        sendJson(response, 500, {
            error: error instanceof Error ? error.message : "Error inesperado.",
        });
    }
}
