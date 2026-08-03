import fs from "node:fs";
import path from "node:path";
import { loadMapNpcPlacements } from "./mapNpcStorage";
import {
    FRONTEND_MAPS_DIR,
    FRONTEND_MAPS_OPTIMIZED_DIR,
    FRONTEND_STANDALONE_MAPS_OPTIMIZED_DIR,
    MAPS_SOURCE_DIR,
    getMapDir,
    parseCoordinateKey,
    toFiniteNumber,
} from "./mapSource";

/**
 * Compactado del formato fuente al formato optimizado que descarga el cliente
 * (`frontend/public/maps/` y `maps_optimized/`). Extraido de
 * `scripts/exportFrontendOptimizedMaps.ts` sin cambios de comportamiento.
 */

type TerrainTile = {
    blocked?: boolean;
    graphics?: number | Array<number | null>;
};

export type TerrainMap = {
    id?: number;
    width?: number;
    height?: number;
    palette?: Record<string, TerrainTile>;
    rows?: number[][];
};

export type SpecialsMap = {
    id?: number;
    exits?: Record<string, { map?: number; x?: number; y?: number }>;
    objects?: Record<string, { objIndex?: number; amount?: number }>;
    npcs?: Record<string, number>;
    triggers?: Record<string, number>;
};

export type NpcPlacement = {
    mapNum?: number;
    x?: number;
    y?: number;
    npcIndex?: number;
};

export type CompactTile = {
    b?: 1;
    g?: number | Array<number | null>;
    e?: { m: number; x: number; y: number };
    n?: number;
    t?: number;
    o?: { i: number; a: number };
};

export type OptimizedMap = {
    id: number;
    w: number;
    h: number;
    d: number[];
    cx?: CompactTile[];
};

/** Orden de claves canonico, para que la firma de deduplicacion sea estable. */
export function sortCompactTile(tile: CompactTile): CompactTile {
    const result: CompactTile = {};

    if (tile.b) {
        result.b = 1;
    }

    if (tile.g !== undefined) {
        result.g = tile.g;
    }

    if (tile.e) {
        result.e = tile.e;
    }

    if (tile.n !== undefined) {
        result.n = tile.n;
    }

    if (tile.t !== undefined) {
        result.t = tile.t;
    }

    if (tile.o) {
        result.o = tile.o;
    }

    return result;
}

export function buildCompactMap(mapId: number, terrain: TerrainMap, specials: SpecialsMap): OptimizedMap {
    const width = Math.max(1, toFiniteNumber(terrain.width) ?? 100);
    const height = Math.max(1, toFiniteNumber(terrain.height) ?? 100);
    const palette = terrain.palette ?? {};
    const rows = Array.isArray(terrain.rows) ? terrain.rows : [];
    const exitByCoordinate = new Map<string, { map: number; x: number; y: number }>();
    const objectByCoordinate = new Map<string, { objIndex: number; amount: number }>();
    const triggerByCoordinate = new Map<string, number>();
    const complexIndexBySignature = new Map<string, number>();
    const complexTiles: CompactTile[] = [];
    const data: number[] = [];

    for (const [coordinateKey, exit] of Object.entries(specials.exits ?? {})) {
        const coordinates = parseCoordinateKey(coordinateKey);
        if (!coordinates) {
            continue;
        }

        const map = toFiniteNumber(exit.map);
        const x = toFiniteNumber(exit.x);
        const y = toFiniteNumber(exit.y);
        if (map === undefined || x === undefined || y === undefined) {
            continue;
        }

        exitByCoordinate.set(`${coordinates.x},${coordinates.y}`, { map, x, y });
    }

    for (const [coordinateKey, objectInfo] of Object.entries(specials.objects ?? {})) {
        const coordinates = parseCoordinateKey(coordinateKey);
        if (!coordinates) {
            continue;
        }

        const objIndex = toFiniteNumber(objectInfo.objIndex);
        const amount = toFiniteNumber(objectInfo.amount);
        if (objIndex === undefined || amount === undefined) {
            continue;
        }

        objectByCoordinate.set(`${coordinates.x},${coordinates.y}`, { objIndex, amount });
    }

    for (const [coordinateKey, trigger] of Object.entries(specials.triggers ?? {})) {
        const coordinates = parseCoordinateKey(coordinateKey);
        if (!coordinates) {
            continue;
        }

        const normalizedTrigger = toFiniteNumber(trigger);
        if (normalizedTrigger === undefined) {
            continue;
        }

        triggerByCoordinate.set(`${coordinates.x},${coordinates.y}`, normalizedTrigger);
    }

    for (let y = 1; y <= height; y++) {
        for (let x = 1; x <= width; x++) {
            const paletteId = rows[y - 1]?.[x - 1] ?? 0;
            const terrainTile = paletteId > 0 ? palette[String(paletteId)] : undefined;
            const coordinateKey = `${x},${y}`;
            const compactTile: CompactTile = {};

            if (terrainTile?.blocked) {
                compactTile.b = 1;
            }

            if (terrainTile?.graphics !== undefined) {
                compactTile.g = terrainTile.graphics;
            }

            const exit = exitByCoordinate.get(coordinateKey);
            if (exit) {
                compactTile.e = {
                    m: exit.map,
                    x: exit.x,
                    y: exit.y,
                };
            }

            const objectInfo = objectByCoordinate.get(coordinateKey);
            if (objectInfo) {
                compactTile.o = {
                    i: objectInfo.objIndex,
                    a: objectInfo.amount,
                };
            }

            const trigger = triggerByCoordinate.get(coordinateKey);
            if (trigger !== undefined) {
                compactTile.t = trigger;
            }

            const npcIndex = toFiniteNumber((specials.npcs ?? {})[coordinateKey]);
            if (npcIndex !== undefined) {
                compactTile.n = npcIndex;
            }

            const normalizedTile = sortCompactTile(compactTile);
            const tileKeys = Object.keys(normalizedTile);
            if (tileKeys.length === 0) {
                data.push(0);
                continue;
            }

            if (tileKeys.length === 1 && normalizedTile.g !== undefined) {
                if (typeof normalizedTile.g === "number") {
                    data.push(normalizedTile.g);
                    continue;
                }
            }

            if (tileKeys.length === 2 && normalizedTile.b === 1 && typeof normalizedTile.g === "number") {
                data.push(100000 + normalizedTile.g);
                continue;
            }

            const signature = JSON.stringify(normalizedTile);
            let complexIndex = complexIndexBySignature.get(signature);

            if (complexIndex === undefined) {
                complexIndex = complexTiles.length;
                complexIndexBySignature.set(signature, complexIndex);
                complexTiles.push(normalizedTile);
            }

            data.push(-(complexIndex + 1));
        }
    }

    return complexTiles.length > 0
        ? { id: mapId, w: width, h: height, d: data, cx: complexTiles }
        : { id: mapId, w: width, h: height, d: data };
}

/** Los spawns persistentes de `npcs.json` pisan los NPC inline de `specials.npcs`. */
export function mergeNpcPlacements(specials: SpecialsMap, npcPlacements: NpcPlacement[]): SpecialsMap {
    const mergedNpcs = { ...(specials.npcs ?? {}) };

    for (const placement of npcPlacements) {
        const x = toFiniteNumber(placement.x);
        const y = toFiniteNumber(placement.y);
        const npcIndex = toFiniteNumber(placement.npcIndex);
        if (x === undefined || y === undefined || npcIndex === undefined) {
            continue;
        }

        mergedNpcs[`${x},${y}`] = npcIndex;
    }

    return {
        ...specials,
        npcs: mergedNpcs,
    };
}

function readJsonFile<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJsonFile(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
}

export function buildOptimizedMap(mapId: number, sourceDir: string = MAPS_SOURCE_DIR): OptimizedMap {
    const mapDir = getMapDir(mapId, sourceDir);
    const terrainPath = path.join(mapDir, "terrain.json");
    const specialsPath = path.join(mapDir, "specials.json");

    if (!fs.existsSync(terrainPath)) {
        throw new Error(`Mapa ${mapId}: no existe ${terrainPath}`);
    }

    const terrain = readJsonFile<TerrainMap>(terrainPath);
    const specials = fs.existsSync(specialsPath)
        ? readJsonFile<SpecialsMap>(specialsPath)
        : ({ id: mapId, exits: {}, objects: {}, npcs: {}, triggers: {} } as SpecialsMap);

    return buildCompactMap(mapId, terrain, mergeNpcPlacements(specials, loadMapNpcPlacements(mapId)));
}

/**
 * Regenera el mapa optimizado en cada directorio destino que exista.
 * Devuelve los directorios en los que realmente escribio: en la imagen Docker
 * del servidor no existe ninguno de los dos.
 */
export function exportOptimizedMap(
    mapId: number,
    outputDirs: string[] = [FRONTEND_MAPS_OPTIMIZED_DIR, FRONTEND_MAPS_DIR, FRONTEND_STANDALONE_MAPS_OPTIMIZED_DIR],
    sourceDir: string = MAPS_SOURCE_DIR,
): { optimizedMap: OptimizedMap; wroteTo: string[] } {
    const optimizedMap = buildOptimizedMap(mapId, sourceDir);
    const fileName = `mapa_${mapId}.json`;
    const wroteTo: string[] = [];

    for (const outputDir of outputDirs) {
        if (!fs.existsSync(outputDir)) {
            continue;
        }

        writeJsonFile(path.join(outputDir, fileName), optimizedMap);
        wroteTo.push(outputDir);
    }

    return { optimizedMap, wroteTo };
}

/** Variante para el CLI: escribe siempre, creando el directorio si hace falta. */
export function exportOptimizedMapToDir(
    mapId: number,
    outputDir: string,
    sourceDir: string = MAPS_SOURCE_DIR,
): OptimizedMap {
    const optimizedMap = buildOptimizedMap(mapId, sourceDir);
    writeJsonFile(path.join(outputDir, `mapa_${mapId}.json`), optimizedMap);

    return optimizedMap;
}
