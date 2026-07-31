import fs from "node:fs";
import path from "node:path";
import { loadMapNpcPlacements } from "../mapNpcStorage";
import {
    type EditableSpecials,
    type EditableTerrain,
    type EditorMapBundle,
    MAPS_SOURCE_DIR,
    expandMap,
    getMapDir,
    internMap,
    listMapIds,
    mapExists,
    readMapMeta,
    readMapSpecials,
    readMapTerrain,
} from "../mapSource";

/**
 * Verifica que expandir un mapa a la grilla plana del editor y volver a
 * internarlo preserve su significado.
 *
 * Dos niveles:
 *  - SEMANTICO (bloqueante): la grilla expandida y las entidades tienen que ser
 *    identicas. Si esto falla, guardar un mapa sin tocarlo lo corrompe.
 *  - BYTES (informativo): cuanto churn produce el primer guardado. Diferencias
 *    de formato, de orden de claves o entradas de paleta huerfanas aparecen
 *    aca sin ser errores.
 */

type SemanticFailure = { mapId: number; what: string; detail: string };
type ByteDifference = { mapId: number; what: string; reason: string };

function tileGridSignature(bundle: EditorMapBundle): string[] {
    return bundle.tiles.map((tile) =>
        JSON.stringify([
            tile.graphics,
            tile.blocked,
            tile.exit ?? null,
            tile.object ?? null,
            tile.npc ?? null,
            tile.trigger ?? null,
            tile.spawn ?? null,
        ]),
    );
}

function compareGrids(before: string[], after: string[]): string | null {
    if (before.length !== after.length) {
        return `cantidad de tiles: ${before.length} vs ${after.length}`;
    }

    const mismatches: number[] = [];
    for (let index = 0; index < before.length; index++) {
        if (before[index] !== after[index]) {
            mismatches.push(index);
        }
    }

    if (mismatches.length === 0) {
        return null;
    }

    const sample = mismatches
        .slice(0, 3)
        .map((index) => `    #${index}: ${before[index]} -> ${after[index]}`)
        .join("\n");

    return `${mismatches.length} tiles distintos\n${sample}`;
}

/** Compara dos objetos keyed por "x,y" ignorando el orden de las claves. */
function compareKeyedRecords(before: Record<string, unknown>, after: Record<string, unknown>): string | null {
    const beforeKeys = Object.keys(before).sort();
    const afterKeys = Object.keys(after).sort();

    const missing = beforeKeys.filter((key) => !(key in after));
    const added = afterKeys.filter((key) => !(key in before));

    if (missing.length > 0 || added.length > 0) {
        return `faltan [${missing.slice(0, 5).join(" ")}] sobran [${added.slice(0, 5).join(" ")}]`;
    }

    for (const key of beforeKeys) {
        const left = JSON.stringify(before[key]);
        const right = JSON.stringify(after[key]);
        if (left !== right) {
            return `clave ${key}: ${left} -> ${right}`;
        }
    }

    return null;
}

/** Entradas de paleta que ninguna fila referencia, y entradas repetidas. */
function auditPalette(terrain: EditableTerrain): { orphans: number; duplicates: number } {
    const used = new Set<number>();
    for (const row of terrain.rows ?? []) {
        for (const paletteId of row) {
            used.add(paletteId);
        }
    }

    const entries = Object.entries(terrain.palette ?? {});
    const orphans = entries.filter(([key]) => !used.has(Number.parseInt(key, 10))).length;
    const signatures = new Set(entries.map(([, value]) => JSON.stringify(value)));

    return { orphans, duplicates: entries.length - signatures.size };
}

function describeByteDifference(
    onDisk: string,
    regenerated: string,
    parsedOnDisk: unknown,
    palette: { orphans: number; duplicates: number },
): string | null {
    if (onDisk === regenerated) {
        return null;
    }

    if (JSON.stringify(parsedOnDisk) === regenerated) {
        return "solo formato (el archivo en disco esta indentado)";
    }

    const notes: string[] = [];
    if (palette.orphans > 0) {
        notes.push(`${palette.orphans} entrada(s) de paleta huerfana(s) descartada(s)`);
    }
    if (palette.duplicates > 0) {
        notes.push(`${palette.duplicates} entrada(s) de paleta duplicada(s) unificada(s)`);
    }
    if (notes.length > 0) {
        return notes.join(" + ");
    }

    const compactOnDisk = JSON.stringify(parsedOnDisk);
    if (compactOnDisk.length === regenerated.length) {
        return "mismo tamano, distinto orden de claves";
    }

    return `tamano ${compactOnDisk.length} -> ${regenerated.length}`;
}

function main(): void {
    const sourceDir = MAPS_SOURCE_DIR;
    const mapIds = listMapIds(sourceDir).filter((mapId) => mapExists(mapId, sourceDir));
    const semanticFailures: SemanticFailure[] = [];
    const byteDifferences: ByteDifference[] = [];

    for (const mapId of mapIds) {
        const mapDir = getMapDir(mapId, sourceDir);
        const meta = readMapMeta(mapId, sourceDir);
        const terrainOnDisk = readMapTerrain(mapId, sourceDir);
        const specialsOnDisk = readMapSpecials(mapId, sourceDir);
        const spawnsOnDisk = loadMapNpcPlacements(mapId);

        const bundle = expandMap(meta, terrainOnDisk, specialsOnDisk, spawnsOnDisk);
        const { terrain, specials, spawns } = internMap(bundle);

        // --- Semantico: reexpandir lo internado y comparar grillas ---
        const reBundle = expandMap(meta, terrain, specials, spawns);
        const gridDiff = compareGrids(tileGridSignature(bundle), tileGridSignature(reBundle));
        if (gridDiff) {
            semanticFailures.push({ mapId, what: "grilla", detail: gridDiff });
        }

        for (const bucket of ["exits", "objects", "npcs", "triggers"] as const) {
            const diff = compareKeyedRecords(
                (specialsOnDisk[bucket] ?? {}) as Record<string, unknown>,
                (specials[bucket] ?? {}) as Record<string, unknown>,
            );
            if (diff) {
                semanticFailures.push({ mapId, what: `specials.${bucket}`, detail: diff });
            }
        }

        const sortSpawns = (list: typeof spawns) => JSON.stringify([...list].sort((a, b) => a.y - b.y || a.x - b.x));
        if (sortSpawns(spawns) !== sortSpawns(spawnsOnDisk)) {
            semanticFailures.push({
                mapId,
                what: "npcs.json",
                detail: `${spawnsOnDisk.length} en disco vs ${spawns.length} generados`,
            });
        }

        // --- Bytes: cuanto churn produce guardar sin tocar nada ---
        const rawTerrain = fs.readFileSync(path.join(mapDir, "terrain.json"), "utf8");
        const terrainReason = describeByteDifference(
            rawTerrain,
            JSON.stringify(terrain),
            terrainOnDisk,
            auditPalette(terrainOnDisk),
        );
        if (terrainReason) {
            byteDifferences.push({ mapId, what: "terrain.json", reason: terrainReason });
        }

        const specialsPath = path.join(mapDir, "specials.json");
        if (fs.existsSync(specialsPath)) {
            const specialsReason = describeByteDifference(
                fs.readFileSync(specialsPath, "utf8"),
                JSON.stringify(specials),
                specialsOnDisk as unknown as EditableSpecials,
                { orphans: 0, duplicates: 0 },
            );
            if (specialsReason) {
                byteDifferences.push({ mapId, what: "specials.json", reason: specialsReason });
            }
        }
    }

    console.log(`Mapas verificados: ${mapIds.length}`);

    if (byteDifferences.length > 0) {
        console.log(`\nDiferencias de bytes (informativo): ${byteDifferences.length}`);
        for (const difference of byteDifferences) {
            console.log(`  mapa ${difference.mapId} / ${difference.what}: ${difference.reason}`);
        }
    } else {
        console.log("Sin diferencias de bytes: guardar sin tocar nada no genera diff.");
    }

    if (semanticFailures.length === 0) {
        console.log("\nRound-trip semantico OK.");
        return;
    }

    console.error(`\nFALLAS SEMANTICAS: ${semanticFailures.length}\n`);
    for (const failure of semanticFailures.slice(0, 20)) {
        console.error(`- mapa ${failure.mapId} / ${failure.what}: ${failure.detail}\n`);
    }

    process.exitCode = 1;
}

if (require.main === module) {
    main();
}
