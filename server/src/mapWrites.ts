import fs from "node:fs";
import path from "node:path";
import {
    API_MAPS_SOURCE_DIR,
    type EditorMapBundle,
    type MapMetadata,
    type MapNpcPlacement,
    RESTRINGIR_OPTIONS,
    TERRENO_OPTIONS,
    ZONA_OPTIONS,
    getMapDir,
    internMap,
    mapExists,
    nextFreeMapId,
    readMapBundle,
    readMapMeta,
    renameWithRetry,
    toFiniteNumber,
    writeJsonFileAtomic,
} from "./mapSource";
import { loadMapNpcPlacements, writeMapNpcPlacements } from "./mapNpcStorage";
import { exportOptimizedMap } from "./mapExport";
import { type MapSide, planEdgeLink } from "./mapEdges";

/**
 * Orquestacion de escritura del editor de mapas: interna el bundle editado a
 * `terrain.json`/`specials.json`, persiste los spawns a `npcs.json`, escribe
 * `meta.json` cuando la metadata cambio y regenera el mapa optimizado que
 * descarga el cliente.
 */

const MAX_MAP_SIDE = 500;

/** Los cuatro archivos que componen un mapa fuente. */
const MAP_SOURCE_FILES = ["meta.json", "terrain.json", "specials.json", "npcs.json"] as const;

/**
 * Replica un mapa en `api/src/mapas_source`, la copia que lee el wiki de la api
 * (`api/src/repositories/wiki.ts`). Son dos contenedores distintos sin volumen
 * compartido, asi que la api no puede leer el directorio del servidor: la unica
 * forma de que no se desincronicen es escribir las dos.
 *
 * Copia bytes en vez de reserializar, para que las copias sean identicas, y es
 * un no-op si el directorio no existe (imagen Docker del servidor), igual que
 * `exportOptimizedMap`.
 */
export function syncMapToApiSource(mapId: number): boolean {
    if (!fs.existsSync(API_MAPS_SOURCE_DIR)) {
        return false;
    }

    const sourceDir = getMapDir(mapId);
    const targetDir = getMapDir(mapId, API_MAPS_SOURCE_DIR);

    try {
        fs.mkdirSync(targetDir, { recursive: true });

        for (const fileName of MAP_SOURCE_FILES) {
            const sourcePath = path.join(sourceDir, fileName);
            const targetPath = path.join(targetDir, fileName);

            // `npcs.json` se borra cuando el mapa se queda sin spawns, asi que el
            // espejo tiene que replicar el borrado y no dejar el archivo viejo.
            if (!fs.existsSync(sourcePath)) {
                if (fs.existsSync(targetPath)) {
                    fs.unlinkSync(targetPath);
                }
                continue;
            }

            const tempPath = `${targetPath}.tmp`;
            fs.copyFileSync(sourcePath, tempPath);
            renameWithRetry(tempPath, targetPath);
        }

        return true;
    } catch (error) {
        // El mapa ya quedo escrito en la fuente de verdad. Voltear el guardado
        // por no poder actualizar el espejo dejaria al editor inutilizable
        // mientras corre el dev server de la api, y no desharia nada. El desvio
        // se detecta y repara con `pnpm sync-api-maps`.
        console.error(`[EDITOR] No se pudo sincronizar el mapa ${mapId} a la copia de la api:`, error);
        return false;
    }
}

/**
 * `meta.json` no tiene un formato homogeneo en disco: 267 mapas estan
 * minificados y 24 indentados, y los campos `minLevel`/`maxLevel` aparecen en
 * unos si y en otros no. Por eso solo reescribimos el archivo cuando la
 * metadata realmente cambio, y asi guardar un mapa sin tocar sus datos sigue
 * sin generar diff.
 */
function normalizeMapMeta(meta: MapMetadata, mapId: number): MapMetadata {
    const name = typeof meta.name === "string" ? meta.name : "";
    const terreno = String(meta.terreno ?? "");
    const zona = String(meta.zona ?? "");
    const restringir = String(meta.restringir ?? "No");

    if (!(TERRENO_OPTIONS as readonly string[]).includes(terreno)) {
        throw new Error(`Terreno invalido: "${terreno}". Valores validos: ${TERRENO_OPTIONS.join(", ")}.`);
    }

    if (!(ZONA_OPTIONS as readonly string[]).includes(zona)) {
        throw new Error(`Zona invalida: "${zona}". Valores validos: ${ZONA_OPTIONS.join(", ")}.`);
    }

    if (!(RESTRINGIR_OPTIONS as readonly string[]).includes(restringir)) {
        throw new Error(`Restringir invalido: "${restringir}". Valores validos: ${RESTRINGIR_OPTIONS.join(", ")}.`);
    }

    const minLevel = toFiniteNumber(meta.minLevel);
    const maxLevel = toFiniteNumber(meta.maxLevel);

    // Orden de claves canonico, el mismo que ya tienen los archivos en disco.
    return {
        id: mapId,
        name,
        musicNum: toFiniteNumber(meta.musicNum) ?? 0,
        magiaSinEfecto: toFiniteNumber(meta.magiaSinEfecto) ?? 0,
        noEncriptarMp: toFiniteNumber(meta.noEncriptarMp) ?? 0,
        terreno,
        zona,
        restringir,
        ...(minLevel === undefined ? {} : { minLevel }),
        ...(maxLevel === undefined ? {} : { maxLevel }),
        backup: toFiniteNumber(meta.backup) ?? 0,
        pk: toFiniteNumber(meta.pk) ?? 0,
    };
}

/** Escribe `meta.json` solo si cambio algo. Devuelve si toco el archivo. */
function writeMapMetaIfChanged(mapId: number, meta: MapMetadata): boolean {
    const normalized = normalizeMapMeta(meta, mapId);
    const current = mapExists(mapId) ? readMapMeta(mapId) : undefined;

    if (current && JSON.stringify(normalizeMapMeta(current, mapId)) === JSON.stringify(normalized)) {
        return false;
    }

    writeJsonFileAtomic(path.join(getMapDir(mapId), "meta.json"), normalized, true);

    return true;
}

export function saveMapBundle(mapId: number, bundle: EditorMapBundle): EditorMapBundle {
    if (bundle.meta.id !== mapId) {
        throw new Error(`El id del bundle (${bundle.meta.id}) no coincide con el mapa ${mapId}.`);
    }

    if (!mapExists(mapId)) {
        throw new Error(`El mapa ${mapId} no existe.`);
    }

    const { terrain, specials, spawns } = internMap(bundle);
    const mapDir = getMapDir(mapId);

    writeMapMetaIfChanged(mapId, bundle.meta);
    writeJsonFileAtomic(path.join(mapDir, "terrain.json"), terrain);
    writeJsonFileAtomic(path.join(mapDir, "specials.json"), specials);
    writeMapNpcPlacements(mapId, spawns);
    exportOptimizedMap(mapId);
    syncMapToApiSource(mapId);

    return readMapBundle(mapId);
}

export function saveMapNpcs(mapId: number, placements: MapNpcPlacement[]): MapNpcPlacement[] {
    if (!mapExists(mapId)) {
        throw new Error(`El mapa ${mapId} no existe.`);
    }

    writeMapNpcPlacements(
        mapId,
        placements.map((placement) => ({ ...placement, mapNum: mapId })),
    );
    exportOptimizedMap(mapId);
    syncMapToApiSource(mapId);

    return loadMapNpcPlacements(mapId);
}

export type EdgeLinkResult = {
    side: MapSide;
    neighborMapId: number | null;
    previousNeighborMapId: number | null;
    /** Todos los mapas reescritos, incluido el vecino y el vecino anterior. */
    writtenMapIds: number[];
    tilesWritten: number;
    tilesCleared: number;
};

/**
 * Conecta (o desconecta, con `neighborMapId: null`) un borde del mapa con su
 * vecino, escribiendo las salidas de los dos lados. Es una sola operacion
 * porque una transicion de borde solo tiene sentido si existe en ambos mapas.
 */
export function linkMapEdge(mapId: number, side: MapSide, neighborMapId: number | null): EdgeLinkResult {
    const plan = planEdgeLink(mapId, side, neighborMapId);

    for (const bundle of plan.bundles) {
        saveMapBundle(bundle.meta.id, bundle);
    }

    return {
        side: plan.side,
        neighborMapId: plan.neighborMapId,
        previousNeighborMapId: plan.previousNeighborMapId,
        writtenMapIds: plan.bundles.map((bundle) => bundle.meta.id),
        tilesWritten: plan.tilesWritten,
        tilesCleared: plan.tilesCleared,
    };
}

export type CreateMapInput = {
    name?: string;
    width?: number;
    height?: number;
    terreno?: string;
    zona?: string;
    musicNum?: number;
    pk?: number;
};

/**
 * Crea un mapa vacio en el primer id libre del rango seguro. Escribe los cuatro
 * archivos fuente y el mapa optimizado, para que quede listo para pintar.
 */
export function createMap(input: CreateMapInput): EditorMapBundle {
    const mapId = nextFreeMapId();
    const width = Math.min(MAX_MAP_SIDE, Math.max(1, toFiniteNumber(input.width) ?? 100));
    const height = Math.min(MAX_MAP_SIDE, Math.max(1, toFiniteNumber(input.height) ?? 100));

    const meta = normalizeMapMeta(
        {
            id: mapId,
            name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : `Mapa ${mapId}`,
            musicNum: toFiniteNumber(input.musicNum) ?? 0,
            magiaSinEfecto: 0,
            noEncriptarMp: 0,
            terreno: input.terreno ?? "BOSQUE",
            zona: input.zona ?? "CAMPO",
            restringir: "No",
            maxLevel: 0,
            backup: 0,
            pk: toFiniteNumber(input.pk) ?? 0,
        },
        mapId,
    );

    const mapDir = getMapDir(mapId);

    if (fs.existsSync(mapDir)) {
        throw new Error(`El directorio ${mapDir} ya existe.`);
    }

    const rows: number[][] = [];
    for (let y = 0; y < height; y++) {
        rows.push(new Array<number>(width).fill(0));
    }

    writeJsonFileAtomic(path.join(mapDir, "meta.json"), meta, true);
    writeJsonFileAtomic(path.join(mapDir, "terrain.json"), { id: mapId, width, height, palette: {}, rows });
    writeJsonFileAtomic(path.join(mapDir, "specials.json"), {
        id: mapId,
        exits: {},
        objects: {},
        npcs: {},
        triggers: {},
    });
    writeMapNpcPlacements(mapId, []);
    exportOptimizedMap(mapId);
    syncMapToApiSource(mapId);

    return readMapBundle(mapId);
}
