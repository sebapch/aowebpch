import fs from "node:fs";
import path from "node:path";
import { loadMapNpcPlacements } from "../mapNpcStorage";
import {
    MAPS_SOURCE_DIR,
    expandMap,
    getMapDir,
    internMap,
    listMapIds,
    mapExists,
    readMapMeta,
    readMapSpecials,
    readMapTerrain,
    writeJsonFileAtomic,
} from "../mapSource";

/**
 * Reescribe `terrain.json` y `specials.json` en la forma canonica que produce
 * el editor: minificado, sin entradas de paleta huerfanas ni duplicadas, con
 * las claves de specials en orden row-major.
 *
 * Sirve para dejar el arbol limpio antes de empezar a editar, de modo que los
 * diffs posteriores muestren solo cambios reales del mapa. No altera el
 * significado de ningun mapa: `verifyMapRoundtrip` lo comprueba.
 *
 * Uso:
 *   tsx src/scripts/normalizeMapSource.ts --dry-run
 *   tsx src/scripts/normalizeMapSource.ts --maps=1,34
 *   tsx src/scripts/normalizeMapSource.ts
 */

function parseCliArgs(argv: string[]) {
    const mapIds = new Set<number>();
    let dryRun = false;

    for (const arg of argv) {
        if (arg === "--dry-run") {
            dryRun = true;
            continue;
        }

        if (arg.startsWith("--maps=")) {
            for (const rawId of arg.slice("--maps=".length).split(",")) {
                const mapId = Number.parseInt(rawId.trim(), 10);
                if (Number.isInteger(mapId) && mapId > 0) {
                    mapIds.add(mapId);
                }
            }
            continue;
        }

        const mapId = Number.parseInt(arg, 10);
        if (Number.isInteger(mapId) && mapId > 0) {
            mapIds.add(mapId);
        }
    }

    return { dryRun, mapIds: [...mapIds].sort((left, right) => left - right) };
}

function main(): void {
    const { dryRun, mapIds } = parseCliArgs(process.argv.slice(2));
    const sourceDir = MAPS_SOURCE_DIR;
    const resolvedMapIds = (mapIds.length > 0 ? mapIds : listMapIds(sourceDir)).filter((mapId) =>
        mapExists(mapId, sourceDir),
    );

    if (resolvedMapIds.length === 0) {
        throw new Error("No se encontraron mapas para normalizar.");
    }

    const changed: string[] = [];

    for (const mapId of resolvedMapIds) {
        const mapDir = getMapDir(mapId, sourceDir);
        const bundle = expandMap(
            readMapMeta(mapId, sourceDir),
            readMapTerrain(mapId, sourceDir),
            readMapSpecials(mapId, sourceDir),
            loadMapNpcPlacements(mapId),
        );
        const { terrain, specials } = internMap(bundle);

        for (const [fileName, value] of [
            ["terrain.json", terrain],
            ["specials.json", specials],
        ] as const) {
            const filePath = path.join(mapDir, fileName);
            if (!fs.existsSync(filePath)) {
                continue;
            }

            const onDisk = fs.readFileSync(filePath, "utf8");
            const normalized = JSON.stringify(value);
            if (onDisk === normalized) {
                continue;
            }

            changed.push(`mapa ${mapId} / ${fileName} (${onDisk.length} -> ${normalized.length} bytes)`);

            if (!dryRun) {
                writeJsonFileAtomic(filePath, value);
            }
        }
    }

    console.log(`Mapas revisados: ${resolvedMapIds.length}`);

    if (changed.length === 0) {
        console.log("Nada que normalizar.");
        return;
    }

    console.log(`${dryRun ? "Se normalizarian" : "Normalizados"}: ${changed.length} archivo(s)`);
    for (const entry of changed) {
        console.log(`  ${entry}`);
    }
}

if (require.main === module) {
    main();
}
