import fs from "node:fs";
import path from "node:path";
import {
    type EditableSpecials,
    type EditableTerrain,
    type JsonValue,
    type MapMetadata,
    type TerrainTile,
    MAPS_SOURCE_DIR,
    buildCoordinateKey,
    normalizeTileExitDestinations,
    stableStringify,
    toFiniteNumber,
} from "../mapSource";

/**
 * Migracion one-shot del formato legacy de Argentum Online
 * (`server/mapas/mapa_N.json` + `dats/`) al formato fuente actual.
 *
 * El directorio de entrada ya no existe en el repo; se conserva como
 * documentacion del origen de los datos. La logica compartida con el editor
 * vive en `src/mapSource.ts`.
 */

type RawTile = Record<string, unknown>;

const DEFAULT_MAPS_DIR = path.resolve(__dirname, "../../mapas");
const DEFAULT_DATS_DIR = path.resolve(DEFAULT_MAPS_DIR, "dats");
const DEFAULT_OUTPUT_DIR = MAPS_SOURCE_DIR;
const MAP_FILE_PATTERN = /^mapa_(\d+)\.json$/i;

function parseCliArgs(argv: string[]) {
    const mapIds = new Set<number>();
    let inputDir = DEFAULT_MAPS_DIR;
    let datsDir = DEFAULT_DATS_DIR;
    let outputDir = DEFAULT_OUTPUT_DIR;
    let pretty = false;

    for (const arg of argv) {
        if (arg.startsWith("--input-dir=")) {
            inputDir = path.resolve(process.cwd(), arg.slice("--input-dir=".length));
            continue;
        }

        if (arg.startsWith("--dats-dir=")) {
            datsDir = path.resolve(process.cwd(), arg.slice("--dats-dir=".length));
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

        if (arg === "--pretty") {
            pretty = true;
            continue;
        }

        const mapId = Number.parseInt(arg, 10);
        if (Number.isInteger(mapId) && mapId > 0) {
            mapIds.add(mapId);
        }
    }

    return {
        inputDir,
        datsDir,
        outputDir,
        pretty,
        mapIds: [...mapIds].sort((left, right) => left - right),
    };
}

function readJsonFile(filePath: string): unknown {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function getAvailableMapIds(inputDir: string, datsDir: string): number[] {
    const mapFiles = fs.readdirSync(inputDir);
    const mapIds: number[] = [];

    for (const fileName of mapFiles) {
        const match = fileName.match(MAP_FILE_PATTERN);
        if (!match) {
            continue;
        }

        const mapId = Number.parseInt(match[1], 10);
        const datFilePath = path.join(datsDir, fileName);

        if (Number.isInteger(mapId) && mapId > 0 && fs.existsSync(datFilePath)) {
            mapIds.push(mapId);
        }
    }

    return mapIds.sort((left, right) => left - right);
}

function normalizeGraphics(value: unknown): number | Array<number | null> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }

    const graphicsRecord = value as Record<string, unknown>;
    const numericEntries: Array<readonly [number, number]> = Object.entries(graphicsRecord)
        .map(([layer, layerValue]) => {
            const parsedLayer = Number.parseInt(layer, 10);
            const parsedValue = toFiniteNumber(layerValue);

            if (!Number.isInteger(parsedLayer) || parsedLayer <= 0 || parsedValue === undefined) {
                return null;
            }

            return [parsedLayer, parsedValue] as const;
        })
        .filter((entry): entry is readonly [number, number] => entry !== null)
        .sort((left, right) => left[0] - right[0]);

    if (numericEntries.length === 0) {
        return undefined;
    }

    if (numericEntries.length === 1 && numericEntries[0][0] === 1) {
        return numericEntries[0][1];
    }

    const lastLayer = numericEntries[numericEntries.length - 1][0];
    const result: Array<number | null> = Array.from({ length: lastLayer }, () => null);

    for (const [layer, layerValue] of numericEntries) {
        result[layer - 1] = layerValue;
    }

    return result;
}

function buildMetadata(mapId: number, rawMetadata: unknown): MapMetadata {
    const metadata = (
        rawMetadata && typeof rawMetadata === "object" && !Array.isArray(rawMetadata) ? rawMetadata : {}
    ) as Record<string, unknown>;

    return {
        id: mapId,
        name: String(metadata.name ?? ""),
        musicNum: toFiniteNumber(metadata.musicNum) ?? 0,
        magiaSinEfecto: toFiniteNumber(metadata.magiaSinEfecto) ?? 0,
        noEncriptarMp: toFiniteNumber(metadata.noEncriptarMp) ?? 0,
        terreno: String(metadata.terreno ?? ""),
        zona: String(metadata.zona ?? ""),
        restringir: typeof metadata.restringir === "number" ? metadata.restringir : String(metadata.restringir ?? "No"),
        minLevel: toFiniteNumber(metadata.minLevel) ?? 0,
        maxLevel: toFiniteNumber(metadata.maxLevel) ?? 0,
        backup: toFiniteNumber(metadata.backup) ?? 0,
        pk: toFiniteNumber(metadata.pk) ?? 0,
    };
}

function buildEditableMap(
    mapId: number,
    rawMapJson: unknown,
): {
    terrain: EditableTerrain;
    specials: EditableSpecials;
} {
    if (!rawMapJson || typeof rawMapJson !== "object" || Array.isArray(rawMapJson)) {
        throw new Error(`Mapa ${mapId}: formato JSON inválido.`);
    }

    const root = rawMapJson as Record<string, unknown>;
    const mapNode = root[String(mapId)];

    if (!mapNode || typeof mapNode !== "object" || Array.isArray(mapNode)) {
        throw new Error(`Mapa ${mapId}: no se encontró el nodo principal ${mapId}.`);
    }

    const rowKeys = Object.keys(mapNode)
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0)
        .sort((left, right) => left - right);

    const height = rowKeys.at(-1) ?? 0;
    const width = rowKeys.reduce((maxWidth, rowKey) => {
        const row = (mapNode as Record<string, unknown>)[String(rowKey)];
        if (!row || typeof row !== "object" || Array.isArray(row)) {
            return maxWidth;
        }

        const rowWidth = Object.keys(row)
            .map((value) => Number.parseInt(value, 10))
            .filter((value) => Number.isInteger(value) && value > 0)
            .reduce((maxX, x) => Math.max(maxX, x), 0);

        return Math.max(maxWidth, rowWidth);
    }, 0);

    const terrainPaletteBySignature = new Map<string, TerrainTile>();
    const terrainRows: Array<Array<TerrainTile | null>> = [];
    const specials: EditableSpecials = {
        id: mapId,
        exits: {},
        objects: {},
        npcs: {},
        triggers: {},
    };

    for (let y = 1; y <= height; y++) {
        const row = (mapNode as Record<string, unknown>)[String(y)] as Record<string, unknown> | undefined;
        const terrainRow: Array<TerrainTile | null> = [];

        for (let x = 1; x <= width; x++) {
            const rawTile = row?.[String(x)];
            const tile =
                rawTile && typeof rawTile === "object" && !Array.isArray(rawTile) ? (rawTile as RawTile) : null;
            const coordinateKey = buildCoordinateKey(x, y);
            const graphics = normalizeGraphics(tile?.graphics);
            const blocked = toFiniteNumber(tile?.blocked) === 1;

            if (graphics !== undefined) {
                const terrainTile: TerrainTile = {
                    graphics,
                };

                if (blocked) {
                    terrainTile.blocked = true;
                }

                const signature = stableStringify(terrainTile as JsonValue);
                terrainPaletteBySignature.set(signature, terrainTile);
                terrainRow.push(terrainTile);
            } else {
                terrainRow.push(null);
            }

            const tileExit = tile?.tileExit as Record<string, unknown> | undefined;
            const tileExitDestinations = normalizeTileExitDestinations(tileExit);
            if (tileExitDestinations.length === 1) {
                specials.exits[coordinateKey] = tileExitDestinations[0];
            } else if (tileExitDestinations.length > 1) {
                specials.exits[coordinateKey] = {
                    destinations: tileExitDestinations,
                };
            }

            const objInfo = tile?.objInfo as Record<string, unknown> | undefined;
            const objIndex = toFiniteNumber(objInfo?.objIndex);
            const amount = toFiniteNumber(objInfo?.amount);
            if (objIndex !== undefined && amount !== undefined) {
                specials.objects[coordinateKey] = {
                    objIndex,
                    amount,
                };
            }

            const npcIndex = toFiniteNumber(tile?.npcIndex);
            if (npcIndex !== undefined) {
                specials.npcs[coordinateKey] = npcIndex;
            }

            const trigger = toFiniteNumber(tile?.trigger);
            if (trigger !== undefined) {
                specials.triggers[coordinateKey] = trigger;
            }
        }

        terrainRows.push(terrainRow);
    }

    const sortedTerrainEntries = [...terrainPaletteBySignature.entries()].sort(([leftKey], [rightKey]) =>
        leftKey.localeCompare(rightKey),
    );

    const palette: Record<string, TerrainTile> = {};
    const terrainIdBySignature = new Map<string, number>();

    for (let index = 0; index < sortedTerrainEntries.length; index++) {
        const [signature, terrainTile] = sortedTerrainEntries[index];
        const terrainId = index + 1;
        terrainIdBySignature.set(signature, terrainId);
        palette[String(terrainId)] = terrainTile;
    }

    const rows = terrainRows.map((row) =>
        row.map((terrainTile) => {
            if (!terrainTile) {
                return 0;
            }

            const signature = stableStringify(terrainTile as JsonValue);
            return terrainIdBySignature.get(signature) ?? 0;
        }),
    );

    return {
        terrain: {
            id: mapId,
            width,
            height,
            palette,
            rows,
        },
        specials,
    };
}

function writeJsonFile(filePath: string, value: unknown, pretty: boolean): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const output = pretty ? `${JSON.stringify(value, null, 4)}\n` : JSON.stringify(value);
    fs.writeFileSync(filePath, output, "utf8");
}

function exportMap(mapId: number, inputDir: string, datsDir: string, outputDir: string, pretty: boolean): void {
    const mapFilePath = path.join(inputDir, `mapa_${mapId}.json`);
    const datFilePath = path.join(datsDir, `mapa_${mapId}.json`);

    if (!fs.existsSync(mapFilePath)) {
        throw new Error(`Mapa ${mapId}: no existe ${mapFilePath}`);
    }

    if (!fs.existsSync(datFilePath)) {
        throw new Error(`Mapa ${mapId}: no existe ${datFilePath}`);
    }

    const { terrain, specials } = buildEditableMap(mapId, readJsonFile(mapFilePath));
    const metadata = buildMetadata(mapId, readJsonFile(datFilePath));
    const mapOutputDir = path.join(outputDir, `mapa_${mapId}`);

    writeJsonFile(path.join(mapOutputDir, "meta.json"), metadata, pretty);
    writeJsonFile(path.join(mapOutputDir, "terrain.json"), terrain, pretty);
    writeJsonFile(path.join(mapOutputDir, "specials.json"), specials, pretty);

    console.log(
        `Exportado mapa ${mapId} -> ${path.relative(process.cwd(), mapOutputDir)} ` +
            `(terrainPalette=${Object.keys(terrain.palette).length}, exits=${Object.keys(specials.exits).length}, ` +
            `objects=${Object.keys(specials.objects).length}, npcs=${Object.keys(specials.npcs).length}, ` +
            `triggers=${Object.keys(specials.triggers).length})`,
    );
}

function main(): void {
    const { inputDir, datsDir, outputDir, pretty, mapIds } = parseCliArgs(process.argv.slice(2));
    const resolvedMapIds = mapIds.length > 0 ? mapIds : getAvailableMapIds(inputDir, datsDir);

    if (resolvedMapIds.length === 0) {
        throw new Error("No se encontraron mapas para exportar.");
    }

    for (const mapId of resolvedMapIds) {
        exportMap(mapId, inputDir, datsDir, outputDir, pretty);
    }

    console.log(`Listo. Mapas exportados: ${resolvedMapIds.length}`);
}

if (require.main === module) {
    main();
}
