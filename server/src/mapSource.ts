import fs from "node:fs";
import path from "node:path";
import { loadMapNpcPlacements, type MapNpcPlacement } from "./mapNpcStorage";

/**
 * Lectura, escritura y (des)normalizacion del formato fuente de mapas
 * (`mapas_source/mapa_N/{meta,terrain,specials,npcs}.json`).
 *
 * El interning de paleta replica exactamente el algoritmo del script de
 * migracion original (`scripts/exportEditableMaps.ts`) para que reescribir un
 * mapa sin tocarlo produzca bytes identicos a los que ya estan en disco.
 */

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

export type TileExit = {
    map: number;
    x: number;
    y: number;
};

export type TileExitConfig = TileExit | { destinations: TileExit[] };

export type ObjectInfo = {
    objIndex: number;
    amount: number;
};

/** Entrada de paleta tal cual se serializa: `graphics` primero, `blocked` despues. */
export type TerrainTile = {
    graphics: number | Array<number | null>;
    blocked?: true;
};

export type MapMetadata = {
    id: number;
    name: string;
    musicNum: number;
    magiaSinEfecto: number;
    noEncriptarMp: number;
    terreno: string;
    zona: string;
    restringir: string | number;
    minLevel?: number;
    maxLevel: number;
    backup: number;
    pk: number;
};

export type EditableTerrain = {
    id: number;
    width: number;
    height: number;
    palette: Record<string, TerrainTile>;
    rows: number[][];
};

export type EditableSpecials = {
    id: number;
    exits: Record<string, TileExitConfig>;
    objects: Record<string, ObjectInfo>;
    npcs: Record<string, number>;
    triggers: Record<string, number>;
};

/** Las 4 capas siempre presentes; `null` = capa vacia. */
export type LayerGraphics = [number | null, number | null, number | null, number | null];

/** Tile expandido, sin paleta: la forma que consume y produce el editor. */
export type ExpandedTile = {
    graphics: LayerGraphics;
    blocked: boolean;
    exit?: TileExitConfig;
    object?: ObjectInfo;
    /** NPC inline de `specials.npcs` (legado, el cliente lo ignora). */
    npc?: number;
    trigger?: number;
    /** Spawn persistente de `npcs.json`, que es lo que el servidor instancia. */
    spawn?: { npcIndex: number; movement?: number };
};

/** Mapa completo en forma plana. `tiles` es row-major: indice `(y-1)*width + (x-1)`. */
export type EditorMapBundle = {
    meta: MapMetadata;
    width: number;
    height: number;
    tiles: ExpandedTile[];
};

export type MapSummary = {
    id: number;
    name: string;
    width: number;
    height: number;
    terreno: string;
    zona: string;
    pk: number;
};

export const MAPS_SOURCE_DIR = path.resolve(__dirname, "../mapas_source");
export const API_MAPS_SOURCE_DIR = path.resolve(__dirname, "../../api/src/mapas_source");
export const FRONTEND_MAPS_DIR = path.resolve(__dirname, "../../frontend/public/maps");
export const FRONTEND_MAPS_OPTIMIZED_DIR = path.resolve(__dirname, "../../frontend/public/maps_optimized");

const MAP_DIR_PATTERN = /^mapa_(\d+)$/i;

/** Ids reservados: 500-599 son mapas locales del cliente, >=1000 instancias dinamicas. */
export const NEW_MAP_ID_MIN = 289;
export const NEW_MAP_ID_MAX = 499;

export function getMapDir(mapNum: number, sourceDir: string = MAPS_SOURCE_DIR): string {
    return path.join(sourceDir, `mapa_${mapNum}`);
}

export function toFiniteNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
}

export function buildCoordinateKey(x: number, y: number): string {
    return `${x},${y}`;
}

export function parseCoordinateKey(key: string): { x: number; y: number } | null {
    const [rawX, rawY] = key.split(",");
    const x = Number.parseInt(rawX ?? "", 10);
    const y = Number.parseInt(rawY ?? "", 10);

    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || y < 1) {
        return null;
    }

    return { x, y };
}

export function sortJsonValue(value: JsonValue): JsonValue {
    if (Array.isArray(value)) {
        return value.map((entry) => sortJsonValue(entry));
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    const sortedEntries = Object.entries(value)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, entryValue]) => [key, sortJsonValue(entryValue)] as const);

    return Object.fromEntries(sortedEntries);
}

export function stableStringify(value: JsonValue): string {
    return JSON.stringify(sortJsonValue(value));
}

/**
 * Normaliza el `graphics` de una entrada de paleta (numero pelado o array) a las
 * 4 capas siempre presentes.
 */
export function toLayerGraphics(value: unknown): LayerGraphics {
    const result: LayerGraphics = [null, null, null, null];

    if (typeof value === "number" && Number.isFinite(value)) {
        result[0] = value;
        return result;
    }

    if (Array.isArray(value)) {
        for (let index = 0; index < Math.min(4, value.length); index++) {
            const graphic = toFiniteNumber(value[index]);
            result[index] = graphic === undefined ? null : graphic;
        }
    }

    return result;
}

/**
 * Inversa de `toLayerGraphics`: recorta capas vacias del final y colapsa a un
 * numero pelado cuando solo hay capa 1, que es como esta escrito en disco.
 * Devuelve `undefined` si el tile no tiene ningun grafico.
 */
export function fromLayerGraphics(graphics: LayerGraphics): number | Array<number | null> | undefined {
    let lastLayer = -1;
    for (let index = 0; index < graphics.length; index++) {
        if (graphics[index] !== null && graphics[index] !== undefined) {
            lastLayer = index;
        }
    }

    if (lastLayer < 0) {
        return undefined;
    }

    if (lastLayer === 0) {
        return graphics[0] as number;
    }

    return graphics.slice(0, lastLayer + 1).map((graphic) => (graphic === undefined ? null : graphic));
}

export function normalizeTileExitDestinations(tileExit: unknown): TileExit[] {
    const exitRecord =
        tileExit && typeof tileExit === "object" ? (tileExit as Record<string, unknown>) : undefined;
    const rawDestinations = Array.isArray(exitRecord?.destinations)
        ? exitRecord.destinations
        : exitRecord
          ? [exitRecord]
          : [];
    const destinations: TileExit[] = [];

    for (const destination of rawDestinations) {
        const destinationRecord = destination as Record<string, unknown>;
        const map = toFiniteNumber(destinationRecord?.map);
        const x = toFiniteNumber(destinationRecord?.x);
        const y = toFiniteNumber(destinationRecord?.y);

        if (map === undefined || x === undefined || y === undefined) {
            continue;
        }

        destinations.push({ map, x, y });
    }

    return destinations;
}

function readJsonFile<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

// ---------------------------------------------------------------------------
// Expandir: terrain + specials + npcs -> grilla plana
// ---------------------------------------------------------------------------

export function expandMap(
    meta: MapMetadata,
    terrain: EditableTerrain,
    specials: EditableSpecials,
    spawns: MapNpcPlacement[],
): EditorMapBundle {
    const width = Math.max(1, toFiniteNumber(terrain.width) ?? 100);
    const height = Math.max(1, toFiniteNumber(terrain.height) ?? 100);
    const palette = terrain.palette ?? {};
    const rows = Array.isArray(terrain.rows) ? terrain.rows : [];
    const tiles: ExpandedTile[] = new Array(width * height);

    for (let y = 1; y <= height; y++) {
        for (let x = 1; x <= width; x++) {
            const paletteId = toFiniteNumber(rows[y - 1]?.[x - 1]) ?? 0;
            const paletteTile = paletteId > 0 ? palette[String(paletteId)] : undefined;

            tiles[(y - 1) * width + (x - 1)] = {
                graphics: toLayerGraphics(paletteTile?.graphics),
                blocked: paletteTile?.blocked === true,
            };
        }
    }

    const tileAt = (x: number, y: number): ExpandedTile | undefined => {
        if (x < 1 || y < 1 || x > width || y > height) {
            return undefined;
        }

        return tiles[(y - 1) * width + (x - 1)];
    };

    for (const [coordinateKey, exit] of Object.entries(specials.exits ?? {})) {
        const coordinates = parseCoordinateKey(coordinateKey);
        const tile = coordinates ? tileAt(coordinates.x, coordinates.y) : undefined;
        if (!tile) {
            continue;
        }

        const destinations = normalizeTileExitDestinations(exit);
        if (destinations.length === 0) {
            continue;
        }

        tile.exit = destinations.length === 1 ? destinations[0] : { destinations };
    }

    for (const [coordinateKey, objectInfo] of Object.entries(specials.objects ?? {})) {
        const coordinates = parseCoordinateKey(coordinateKey);
        const tile = coordinates ? tileAt(coordinates.x, coordinates.y) : undefined;
        if (!tile) {
            continue;
        }

        const objIndex = toFiniteNumber(objectInfo?.objIndex);
        const amount = toFiniteNumber(objectInfo?.amount);
        if (objIndex === undefined || amount === undefined) {
            continue;
        }

        tile.object = { objIndex, amount };
    }

    for (const [coordinateKey, npcIndex] of Object.entries(specials.npcs ?? {})) {
        const coordinates = parseCoordinateKey(coordinateKey);
        const tile = coordinates ? tileAt(coordinates.x, coordinates.y) : undefined;
        const normalized = toFiniteNumber(npcIndex);
        if (!tile || normalized === undefined) {
            continue;
        }

        tile.npc = normalized;
    }

    for (const [coordinateKey, trigger] of Object.entries(specials.triggers ?? {})) {
        const coordinates = parseCoordinateKey(coordinateKey);
        const tile = coordinates ? tileAt(coordinates.x, coordinates.y) : undefined;
        const normalized = toFiniteNumber(trigger);
        if (!tile || normalized === undefined) {
            continue;
        }

        tile.trigger = normalized;
    }

    for (const spawn of spawns) {
        const tile = tileAt(spawn.x, spawn.y);
        if (!tile) {
            continue;
        }

        tile.spawn =
            spawn.movement === undefined
                ? { npcIndex: spawn.npcIndex }
                : { npcIndex: spawn.npcIndex, movement: spawn.movement };
    }

    return { meta, width, height, tiles };
}

// ---------------------------------------------------------------------------
// Internar: grilla plana -> terrain + specials + npcs
// ---------------------------------------------------------------------------

export function internMap(bundle: EditorMapBundle): {
    terrain: EditableTerrain;
    specials: EditableSpecials;
    spawns: MapNpcPlacement[];
} {
    const { meta, width, height, tiles } = bundle;
    const mapId = meta.id;

    // Mismo algoritmo que el script de migracion: firma estable por tile,
    // ordenada con localeCompare, ids asignados 1..N en ese orden.
    const paletteBySignature = new Map<string, TerrainTile>();
    const signatureRows: Array<Array<string | null>> = [];
    const specials: EditableSpecials = {
        id: mapId,
        exits: {},
        objects: {},
        npcs: {},
        triggers: {},
    };
    const spawns: MapNpcPlacement[] = [];

    for (let y = 1; y <= height; y++) {
        const signatureRow: Array<string | null> = [];

        for (let x = 1; x <= width; x++) {
            const tile = tiles[(y - 1) * width + (x - 1)];
            const coordinateKey = buildCoordinateKey(x, y);

            if (!tile) {
                signatureRow.push(null);
                continue;
            }

            const graphics = fromLayerGraphics(tile.graphics);

            if (graphics === undefined) {
                // Sin graficos no hay entrada de paleta posible, asi que un tile
                // solo-bloqueado no se puede representar. Es una limitacion del
                // formato, no del editor.
                signatureRow.push(null);
            } else {
                const terrainTile: TerrainTile = { graphics };

                if (tile.blocked) {
                    terrainTile.blocked = true;
                }

                const signature = stableStringify(terrainTile as unknown as JsonValue);
                paletteBySignature.set(signature, terrainTile);
                signatureRow.push(signature);
            }

            if (tile.exit) {
                const destinations = normalizeTileExitDestinations(tile.exit);
                if (destinations.length === 1) {
                    specials.exits[coordinateKey] = destinations[0];
                } else if (destinations.length > 1) {
                    specials.exits[coordinateKey] = { destinations };
                }
            }

            if (tile.object) {
                specials.objects[coordinateKey] = {
                    objIndex: tile.object.objIndex,
                    amount: tile.object.amount,
                };
            }

            if (tile.npc !== undefined) {
                specials.npcs[coordinateKey] = tile.npc;
            }

            if (tile.trigger !== undefined) {
                specials.triggers[coordinateKey] = tile.trigger;
            }

            if (tile.spawn) {
                spawns.push(
                    tile.spawn.movement === undefined
                        ? { mapNum: mapId, x, y, npcIndex: tile.spawn.npcIndex }
                        : { mapNum: mapId, x, y, npcIndex: tile.spawn.npcIndex, movement: tile.spawn.movement },
                );
            }
        }

        signatureRows.push(signatureRow);
    }

    const sortedSignatures = [...paletteBySignature.entries()].sort(([leftKey], [rightKey]) =>
        leftKey.localeCompare(rightKey),
    );

    const palette: Record<string, TerrainTile> = {};
    const idBySignature = new Map<string, number>();

    for (let index = 0; index < sortedSignatures.length; index++) {
        const [signature, terrainTile] = sortedSignatures[index];
        const terrainId = index + 1;
        idBySignature.set(signature, terrainId);
        palette[String(terrainId)] = terrainTile;
    }

    const rows = signatureRows.map((row) =>
        row.map((signature) => (signature === null ? 0 : (idBySignature.get(signature) ?? 0))),
    );

    return {
        terrain: { id: mapId, width, height, palette, rows },
        specials,
        spawns,
    };
}

// ---------------------------------------------------------------------------
// Acceso a disco
// ---------------------------------------------------------------------------

export function listMapIds(sourceDir: string = MAPS_SOURCE_DIR): number[] {
    if (!fs.existsSync(sourceDir)) {
        return [];
    }

    return fs
        .readdirSync(sourceDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name.match(MAP_DIR_PATTERN))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map((match) => Number.parseInt(match[1], 10))
        .filter((mapId) => Number.isInteger(mapId) && mapId > 0)
        .sort((left, right) => left - right);
}

export function mapExists(mapNum: number, sourceDir: string = MAPS_SOURCE_DIR): boolean {
    const mapDir = getMapDir(mapNum, sourceDir);

    return fs.existsSync(path.join(mapDir, "meta.json")) && fs.existsSync(path.join(mapDir, "terrain.json"));
}

/** Primer id libre en el rango seguro para mapas nuevos. */
export function nextFreeMapId(sourceDir: string = MAPS_SOURCE_DIR): number {
    const used = new Set(listMapIds(sourceDir));

    for (let mapId = NEW_MAP_ID_MIN; mapId <= NEW_MAP_ID_MAX; mapId++) {
        if (!used.has(mapId)) {
            return mapId;
        }
    }

    throw new Error(`No hay ids de mapa libres en el rango ${NEW_MAP_ID_MIN}-${NEW_MAP_ID_MAX}.`);
}

export function readMapMeta(mapNum: number, sourceDir: string = MAPS_SOURCE_DIR): MapMetadata {
    return readJsonFile<MapMetadata>(path.join(getMapDir(mapNum, sourceDir), "meta.json"));
}

export function readMapTerrain(mapNum: number, sourceDir: string = MAPS_SOURCE_DIR): EditableTerrain {
    return readJsonFile<EditableTerrain>(path.join(getMapDir(mapNum, sourceDir), "terrain.json"));
}

export function readMapSpecials(mapNum: number, sourceDir: string = MAPS_SOURCE_DIR): EditableSpecials {
    const specialsPath = path.join(getMapDir(mapNum, sourceDir), "specials.json");

    if (!fs.existsSync(specialsPath)) {
        return { id: mapNum, exits: {}, objects: {}, npcs: {}, triggers: {} };
    }

    return readJsonFile<EditableSpecials>(specialsPath);
}

export function readMapBundle(mapNum: number, sourceDir: string = MAPS_SOURCE_DIR): EditorMapBundle {
    if (!mapExists(mapNum, sourceDir)) {
        throw new Error(`Mapa ${mapNum}: no existe ${getMapDir(mapNum, sourceDir)}`);
    }

    return expandMap(
        readMapMeta(mapNum, sourceDir),
        readMapTerrain(mapNum, sourceDir),
        readMapSpecials(mapNum, sourceDir),
        loadMapNpcPlacements(mapNum),
    );
}

export function listMapSummaries(sourceDir: string = MAPS_SOURCE_DIR): MapSummary[] {
    const summaries: MapSummary[] = [];

    for (const mapId of listMapIds(sourceDir)) {
        if (!mapExists(mapId, sourceDir)) {
            continue;
        }

        const meta = readMapMeta(mapId, sourceDir);
        const terrain = readMapTerrain(mapId, sourceDir);

        summaries.push({
            id: mapId,
            name: meta.name ?? "",
            width: toFiniteNumber(terrain.width) ?? 100,
            height: toFiniteNumber(terrain.height) ?? 100,
            terreno: String(meta.terreno ?? ""),
            zona: String(meta.zona ?? ""),
            pk: toFiniteNumber(meta.pk) ?? 0,
        });
    }

    return summaries;
}

/** Escritura atomica: archivo temporal + rename. */
export function writeJsonFileAtomic(filePath: string, value: unknown, pretty = false): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const output = pretty ? `${JSON.stringify(value, null, 4)}\n` : JSON.stringify(value);
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, output, "utf8");
    fs.renameSync(tempPath, filePath);
}

export type { MapNpcPlacement };
