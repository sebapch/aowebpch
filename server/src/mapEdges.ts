import {
    type EditorMapBundle,
    type ExpandedTile,
    type TileExit,
    normalizeTileExitDestinations,
    readMapBundle,
    mapExists,
} from "./mapSource";

/**
 * Transiciones de borde entre mapas.
 *
 * En este formato no existe "el mapa del norte": una transicion es una salida
 * (`tileExit`) por cada tile de la fila o columna del borde. Conectar dos mapas
 * son ~170 salidas, la mitad en cada uno, y por eso se hace desde aca y no a
 * mano en el editor.
 */

export type MapSide = "north" | "south" | "east" | "west";

export const MAP_SIDES: MapSide[] = ["north", "south", "east", "west"];

export const OPPOSITE_SIDE: Record<MapSide, MapSide> = {
    north: "south",
    south: "north",
    east: "west",
    west: "east",
};

export const SIDE_LABELS: Record<MapSide, string> = {
    north: "Norte",
    south: "Sur",
    east: "Este",
    west: "Oeste",
};

/**
 * Margen entre el borde del mapa y la linea de salida, heredado del Argentum
 * original. Se cumple en mas del 97% de las salidas de borde que hay en disco
 * (norte y=7, sur y=alto-6, oeste x=9, este x=ancho-8), pero solo se usa como
 * default: si el mapa ya tiene salidas en ese borde se respeta su linea.
 */
const MARGIN_X = 8;
const MARGIN_Y = 6;

/**
 * Banda usada para clasificar una salida existente como transicion de borde.
 * Misma heuristica que `scripts/build-world-map.cjs`, generalizada a mapas que
 * no sean 100x100.
 */
const EDGE_BAND = 12;

/** Linea (fila o columna) y tramo de tiles que ocupa un borde. */
export type EdgeLine = { side: MapSide; line: number; from: number; to: number };

function defaultEdgeLine(side: MapSide, width: number, height: number): EdgeLine {
    // Las esquinas pertenecen a las filas norte/sur; las columnas este/oeste
    // arrancan una fila mas adentro, tal como estan hoy los mapas en disco.
    switch (side) {
        case "north":
            return { side, line: 1 + MARGIN_Y, from: 1 + MARGIN_X, to: width - MARGIN_X };
        case "south":
            return { side, line: height - MARGIN_Y, from: 1 + MARGIN_X, to: width - MARGIN_X };
        case "west":
            return { side, line: 1 + MARGIN_X, from: 2 + MARGIN_Y, to: height - MARGIN_Y - 1 };
        case "east":
            return { side, line: width - MARGIN_X, from: 2 + MARGIN_Y, to: height - MARGIN_Y - 1 };
    }
}

function isHorizontal(side: MapSide): boolean {
    return side === "north" || side === "south";
}

/** Coordenada del tile numero `index` del tramo de un borde. */
function tileAt(edge: EdgeLine, index: number): { x: number; y: number } {
    return isHorizontal(edge.side) ? { x: index, y: edge.line } : { x: edge.line, y: index };
}

/**
 * Clasifica una salida existente como transicion de borde: sale cerca de un
 * extremo y aterriza cerca del extremo opuesto del mapa destino.
 */
function classifyExit(
    x: number,
    y: number,
    destination: TileExit,
    width: number,
    height: number,
): MapSide | null {
    if (y <= EDGE_BAND && destination.y >= height + 1 - EDGE_BAND) {
        return "north";
    }

    if (y >= height + 1 - EDGE_BAND && destination.y <= EDGE_BAND) {
        return "south";
    }

    if (x <= EDGE_BAND && destination.x >= width + 1 - EDGE_BAND) {
        return "west";
    }

    if (x >= width + 1 - EDGE_BAND && destination.x <= EDGE_BAND) {
        return "east";
    }

    return null;
}

export type SideConnection = {
    side: MapSide;
    /** Mapa destino mayoritario de ese borde. */
    mapId: number;
    tileCount: number;
    line: number;
};

/** Vecino actual de cada borde, deducido de las salidas que ya tiene el mapa. */
export function describeConnections(bundle: EditorMapBundle): SideConnection[] {
    const { width, height, tiles } = bundle;
    // side -> mapa destino -> { tiles, lineas }
    const bySide = new Map<MapSide, Map<number, { tileCount: number; lines: Map<number, number> }>>();

    for (let index = 0; index < tiles.length; index++) {
        const tile = tiles[index];

        if (!tile?.exit) {
            continue;
        }

        const destinations = normalizeTileExitDestinations(tile.exit);

        // Una salida con varios destinos es una puerta especial, no un borde.
        if (destinations.length !== 1) {
            continue;
        }

        const x = (index % width) + 1;
        const y = Math.floor(index / width) + 1;
        const side = classifyExit(x, y, destinations[0], width, height);

        if (!side) {
            continue;
        }

        const byMap = bySide.get(side) ?? new Map();
        const entry = byMap.get(destinations[0].map) ?? { tileCount: 0, lines: new Map<number, number>() };
        const line = isHorizontal(side) ? y : x;

        entry.tileCount += 1;
        entry.lines.set(line, (entry.lines.get(line) ?? 0) + 1);
        byMap.set(destinations[0].map, entry);
        bySide.set(side, byMap);
    }

    const connections: SideConnection[] = [];

    for (const side of MAP_SIDES) {
        const byMap = bySide.get(side);

        if (!byMap) {
            continue;
        }

        // Puede haber restos de una conexion vieja: gana el destino mayoritario.
        const [mapId, entry] = [...byMap.entries()].sort((left, right) => right[1].tileCount - left[1].tileCount)[0];
        const [line] = [...entry.lines.entries()].sort((left, right) => right[1] - left[1])[0];

        connections.push({ side, mapId, tileCount: entry.tileCount, line });
    }

    return connections;
}

/**
 * Linea de borde a usar al escribir: la que el mapa ya usa en ese borde, o el
 * default heredado del Argentum original si el borde esta libre.
 */
export function resolveEdgeLine(bundle: EditorMapBundle, side: MapSide): EdgeLine {
    const fallback = defaultEdgeLine(side, bundle.width, bundle.height);
    const existing = describeConnections(bundle).find((connection) => connection.side === side);

    return existing ? { ...fallback, line: existing.line } : fallback;
}

/**
 * Donde aterriza quien sale por `side`: un tile hacia adentro de la linea de
 * salida opuesta del mapa destino. Si cayera justo sobre ella volveria a
 * disparar la salida y quedaria rebotando entre los dos mapas.
 *
 * La linea llega por parametro y no se vuelve a deducir, porque para cuando se
 * escriben las salidas los bordes ya estan limpios y la deduccion daria el
 * default en vez de la linea real del mapa.
 */
function landingFor(side: MapSide, oppositeLine: number): number {
    return side === "north" || side === "west" ? oppositeLine - 1 : oppositeLine + 1;
}

function clearEdgeExits(bundle: EditorMapBundle, edge: EdgeLine): number {
    let cleared = 0;

    for (let index = edge.from; index <= edge.to; index++) {
        const { x, y } = tileAt(edge, index);
        const tile: ExpandedTile | undefined = bundle.tiles[(y - 1) * bundle.width + (x - 1)];

        if (tile?.exit) {
            tile.exit = undefined;
            cleared += 1;
        }
    }

    return cleared;
}

function writeEdgeExits(
    bundle: EditorMapBundle,
    edge: EdgeLine,
    neighborMapId: number,
    neighborEdge: EdgeLine,
): number {
    const landing = landingFor(edge.side, neighborEdge.line);
    let written = 0;

    for (let index = edge.from; index <= edge.to; index++) {
        const { x, y } = tileAt(edge, index);
        const tile: ExpandedTile | undefined = bundle.tiles[(y - 1) * bundle.width + (x - 1)];

        if (!tile) {
            continue;
        }

        // La coordenada perpendicular al borde se conserva; la paralela salta
        // al otro extremo del mapa vecino.
        tile.exit = isHorizontal(edge.side)
            ? { map: neighborMapId, x, y: landing }
            : { map: neighborMapId, x: landing, y };
        written += 1;
    }

    return written;
}

export type EdgeLinkPlan = {
    side: MapSide;
    neighborMapId: number | null;
    /** Mapas que hay que reescribir, ya con las salidas aplicadas en memoria. */
    bundles: EditorMapBundle[];
    tilesWritten: number;
    tilesCleared: number;
    /** Vecino previo de ese borde, si habia uno distinto al nuevo. */
    previousNeighborMapId: number | null;
};

/**
 * Arma la conexion (o desconexion) de un borde sobre los bundles en memoria,
 * incluyendo el borde de vuelta en el vecino. No escribe nada: quien llama
 * decide como persistir.
 */
export function planEdgeLink(mapId: number, side: MapSide, neighborMapId: number | null): EdgeLinkPlan {
    if (!mapExists(mapId)) {
        throw new Error(`El mapa ${mapId} no existe.`);
    }

    if (neighborMapId === mapId) {
        throw new Error("Un mapa no se puede conectar consigo mismo.");
    }

    const bundle = readMapBundle(mapId);
    const previousNeighborMapId =
        describeConnections(bundle).find((connection) => connection.side === side)?.mapId ?? null;

    let neighbor: EditorMapBundle | null = null;

    if (neighborMapId !== null) {
        if (!mapExists(neighborMapId)) {
            throw new Error(`El mapa ${neighborMapId} no existe.`);
        }

        neighbor = readMapBundle(neighborMapId);

        if (neighbor.width !== bundle.width || neighbor.height !== bundle.height) {
            throw new Error(
                `Los mapas tienen tamanos distintos (${bundle.width}x${bundle.height} vs ` +
                    `${neighbor.width}x${neighbor.height}); la transicion de borde no cuadraria.`,
            );
        }
    }

    // Todas las lineas se resuelven antes de limpiar: una vez borradas las
    // salidas, `resolveEdgeLine` ya no puede deducir la linea real del mapa.
    const edge = resolveEdgeLine(bundle, side);
    const neighborEdge = neighbor ? resolveEdgeLine(neighbor, OPPOSITE_SIDE[side]) : null;

    let tilesCleared = clearEdgeExits(bundle, edge);
    let tilesWritten = 0;
    const bundles = [bundle];

    // Al reconectar a otro mapa hay que limpiar el borde de vuelta del vecino
    // viejo, o queda apuntando a un borde que ya no le responde.
    if (previousNeighborMapId !== null && previousNeighborMapId !== neighborMapId && mapExists(previousNeighborMapId)) {
        const stale = readMapBundle(previousNeighborMapId);
        tilesCleared += clearEdgeExits(stale, resolveEdgeLine(stale, OPPOSITE_SIDE[side]));
        bundles.push(stale);
    }

    if (neighbor && neighborEdge) {
        tilesCleared += clearEdgeExits(neighbor, neighborEdge);
        tilesWritten += writeEdgeExits(bundle, edge, neighbor.meta.id, neighborEdge);
        tilesWritten += writeEdgeExits(neighbor, neighborEdge, bundle.meta.id, edge);
        bundles.push(neighbor);
    }

    return { side, neighborMapId, bundles, tilesWritten, tilesCleared, previousNeighborMapId };
}
