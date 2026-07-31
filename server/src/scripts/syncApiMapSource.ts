import fs from "node:fs";
import path from "node:path";
import { API_MAPS_SOURCE_DIR, MAPS_SOURCE_DIR, getMapDir, listMapIds } from "../mapSource";
import { syncMapToApiSource } from "../mapWrites";

/**
 * Resincroniza `api/src/mapas_source` (la copia que lee el wiki de la api) con
 * `server/mapas_source`, que es la fuente de verdad: es la que carga el juego y
 * la que escribe el editor.
 *
 * Desde que existe el editor los guardados mantienen las dos copias en sincro
 * (`syncMapToApiSource`), pero la copia de la api venia congelada desde el
 * commit inicial. Este script arregla esa deuda y sirve para verificar en CI
 * que no se volvieron a separar (`--check` no escribe y sale con 1 si difieren).
 */

const MAP_SOURCE_FILES = ["meta.json", "terrain.json", "specials.json", "npcs.json"] as const;

type Divergence = { mapId: number; fileName: string; reason: string };

function findDivergences(mapIds: number[]): Divergence[] {
    const divergences: Divergence[] = [];

    for (const mapId of mapIds) {
        const sourceDir = getMapDir(mapId);
        const targetDir = getMapDir(mapId, API_MAPS_SOURCE_DIR);

        for (const fileName of MAP_SOURCE_FILES) {
            const sourcePath = path.join(sourceDir, fileName);
            const targetPath = path.join(targetDir, fileName);
            const sourceExists = fs.existsSync(sourcePath);
            const targetExists = fs.existsSync(targetPath);

            if (!sourceExists && !targetExists) {
                continue;
            }

            if (!sourceExists) {
                divergences.push({ mapId, fileName, reason: "sobra en la api" });
                continue;
            }

            if (!targetExists) {
                divergences.push({ mapId, fileName, reason: "falta en la api" });
                continue;
            }

            if (!fs.readFileSync(sourcePath).equals(fs.readFileSync(targetPath))) {
                divergences.push({ mapId, fileName, reason: "contenido distinto" });
            }
        }
    }

    return divergences;
}

function main(): void {
    const checkOnly = process.argv.includes("--check");

    if (!fs.existsSync(API_MAPS_SOURCE_DIR)) {
        console.log(`No existe ${API_MAPS_SOURCE_DIR}: nada que sincronizar.`);
        return;
    }

    const mapIds = listMapIds(MAPS_SOURCE_DIR);
    const divergences = findDivergences(mapIds);

    console.log(`Mapas revisados: ${mapIds.length}`);

    if (divergences.length === 0) {
        console.log("Las dos copias ya estan sincronizadas.");
        return;
    }

    console.log(`Archivos divergentes: ${divergences.length}`);
    for (const divergence of divergences.slice(0, 30)) {
        console.log(`  mapa_${divergence.mapId}/${divergence.fileName}: ${divergence.reason}`);
    }
    if (divergences.length > 30) {
        console.log(`  ... y ${divergences.length - 30} mas`);
    }

    if (checkOnly) {
        console.error("\nLas copias estan desincronizadas. Corre `pnpm sync-api-maps` para arreglarlo.");
        process.exitCode = 1;
        return;
    }

    const touchedMapIds = new Set(divergences.map((divergence) => divergence.mapId));

    for (const mapId of touchedMapIds) {
        syncMapToApiSource(mapId);
    }

    const remaining = findDivergences(mapIds);

    if (remaining.length > 0) {
        console.error(`\nQuedaron ${remaining.length} archivos divergentes despues de sincronizar.`);
        process.exitCode = 1;
        return;
    }

    console.log(`\nSincronizados ${touchedMapIds.size} mapa(s). Las dos copias son identicas.`);
}

if (require.main === module) {
    main();
}
