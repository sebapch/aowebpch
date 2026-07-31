import path from "node:path";
import {
    type EditorMapBundle,
    type MapNpcPlacement,
    getMapDir,
    internMap,
    mapExists,
    readMapBundle,
    writeJsonFileAtomic,
} from "./mapSource";
import { loadMapNpcPlacements, writeMapNpcPlacements } from "./mapNpcStorage";
import { exportOptimizedMap } from "./mapExport";

/**
 * Orquestacion de escritura del editor de mapas: interna el bundle editado a
 * `terrain.json`/`specials.json`, persiste los spawns a `npcs.json` y
 * regenera el mapa optimizado que descarga el cliente. `meta.json` no se
 * toca: en M2 los metadatos del mapa son de solo lectura.
 */

export function saveMapBundle(mapId: number, bundle: EditorMapBundle): EditorMapBundle {
    if (bundle.meta.id !== mapId) {
        throw new Error(`El id del bundle (${bundle.meta.id}) no coincide con el mapa ${mapId}.`);
    }

    if (!mapExists(mapId)) {
        throw new Error(`El mapa ${mapId} no existe.`);
    }

    const { terrain, specials, spawns } = internMap(bundle);
    const mapDir = getMapDir(mapId);

    writeJsonFileAtomic(path.join(mapDir, "terrain.json"), terrain);
    writeJsonFileAtomic(path.join(mapDir, "specials.json"), specials);
    writeMapNpcPlacements(mapId, spawns);
    exportOptimizedMap(mapId);

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

    return loadMapNpcPlacements(mapId);
}
