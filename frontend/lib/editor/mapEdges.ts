import type { EditorMapModel } from "../../components/editor/model/EditorMapModel";

/**
 * Espejo de la deteccion de bordes del servidor (`server/src/mapEdges.ts`).
 * Aca solo se lee, para mostrar a que mapa da cada borde; escribir siempre pasa
 * por el endpoint, porque una conexion toca dos mapas a la vez.
 */

export type MapSide = "north" | "south" | "east" | "west";

export const MAP_SIDES: MapSide[] = ["north", "south", "east", "west"];

export const SIDE_LABELS: Record<MapSide, string> = {
    north: "Norte",
    south: "Sur",
    east: "Este",
    west: "Oeste",
};

export const SIDE_SHORT: Record<MapSide, string> = {
    north: "N",
    south: "S",
    east: "E",
    west: "O",
};

/** Banda para clasificar una salida como transicion de borde. */
const EDGE_BAND = 12;

export type SideConnection = { side: MapSide; mapId: number; tileCount: number };

function classify(x: number, y: number, destX: number, destY: number, width: number, height: number): MapSide | null {
    if (y <= EDGE_BAND && destY >= height + 1 - EDGE_BAND) return "north";
    if (y >= height + 1 - EDGE_BAND && destY <= EDGE_BAND) return "south";
    if (x <= EDGE_BAND && destX >= width + 1 - EDGE_BAND) return "west";
    if (x >= width + 1 - EDGE_BAND && destX <= EDGE_BAND) return "east";
    return null;
}

/**
 * Vecino de cada borde, deducido de las salidas del mapa. Solo mira la banda de
 * los bordes: una salida en el medio del mapa es una puerta, no una transicion.
 */
export function describeConnections(model: EditorMapModel): Partial<Record<MapSide, SideConnection>> {
    const counts = new Map<string, number>();
    const { width, height } = model;

    const scan = (x: number, y: number) => {
        const tile = model.get(x, y);

        // Varios destinos en un tile es una puerta especial, no un borde.
        if (!tile?.exit || !("map" in tile.exit)) {
            return;
        }

        const side = classify(x, y, tile.exit.x, tile.exit.y, width, height);

        if (side) {
            const key = `${side}:${tile.exit.map}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
    };

    for (let y = 1; y <= height; y++) {
        if (y <= EDGE_BAND || y >= height + 1 - EDGE_BAND) {
            // Fila completa dentro de la banda norte o sur.
            for (let x = 1; x <= width; x++) {
                scan(x, y);
            }
            continue;
        }

        // En el medio del mapa solo interesan las columnas de los costados.
        for (let x = 1; x <= EDGE_BAND; x++) {
            scan(x, y);
            scan(width + 1 - x, y);
        }
    }

    const result: Partial<Record<MapSide, SideConnection>> = {};

    for (const [key, tileCount] of counts) {
        const [side, rawMapId] = key.split(":") as [MapSide, string];
        const mapId = Number(rawMapId);

        // Puede haber restos de una conexion vieja: gana el destino mayoritario.
        if (!result[side] || tileCount > result[side]!.tileCount) {
            result[side] = { side, mapId, tileCount };
        }
    }

    return result;
}
