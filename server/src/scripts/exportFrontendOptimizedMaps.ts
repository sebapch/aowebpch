import path from "node:path";
import { exportOptimizedMapToDir } from "../mapExport";
import { FRONTEND_MAPS_OPTIMIZED_DIR, MAPS_SOURCE_DIR, getActiveMapIds, listMapIds } from "../mapSource";

const DEFAULT_SOURCE_DIR = MAPS_SOURCE_DIR;
const DEFAULT_OUTPUT_DIR = FRONTEND_MAPS_OPTIMIZED_DIR;

function parseCliArgs(argv: string[]) {
    const mapIds = new Set<number>();
    let sourceDir = DEFAULT_SOURCE_DIR;
    let outputDir = DEFAULT_OUTPUT_DIR;
    let activeOnly = false;

    for (const arg of argv) {
        if (arg === "--active-only") {
            activeOnly = true;
            continue;
        }

        if (arg.startsWith("--source-dir=")) {
            sourceDir = path.resolve(process.cwd(), arg.slice("--source-dir=".length));
            continue;
        }

        if (arg.startsWith("--output-dir=")) {
            outputDir = path.resolve(process.cwd(), arg.slice("--output-dir=".length));
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

    return {
        sourceDir,
        outputDir,
        activeOnly,
        mapIds: [...mapIds].sort((left, right) => left - right),
    };
}

function exportMap(mapId: number, sourceDir: string, outputDir: string): void {
    const optimizedMap = exportOptimizedMapToDir(mapId, outputDir, sourceDir);
    const outputPath = path.join(outputDir, `mapa_${mapId}.json`);

    console.log(
        `Exportado optimized mapa ${mapId} -> ${path.relative(process.cwd(), outputPath)} ` +
            `(cells=${optimizedMap.d.length}, complex=${optimizedMap.cx?.length ?? 0})`,
    );
}

function main(): void {
    const { sourceDir, outputDir, activeOnly, mapIds } = parseCliArgs(process.argv.slice(2));
    const resolvedMapIds = mapIds.length > 0
        ? mapIds
        : activeOnly
        ? getActiveMapIds(sourceDir)
        : listMapIds(sourceDir);

    if (resolvedMapIds.length === 0) {
        throw new Error("No se encontraron mapas para exportar.");
    }

    for (const mapId of resolvedMapIds) {
        exportMap(mapId, sourceDir, outputDir);
    }

    console.log(`Listo. Mapas optimizados exportados: ${resolvedMapIds.length}`);
}

if (require.main === module) {
    main();
}
