import type { EditorMapBundle, ExpandedTile, LayerGraphics, MapMetadata } from "../../../lib/editor/types";

export type LayerIndex = 1 | 2 | 3 | 4;

/** Copia profunda de un tile, para guardar en el historial. */
export function cloneTile(tile: ExpandedTile): ExpandedTile {
    const copy: ExpandedTile = {
        graphics: [...tile.graphics] as LayerGraphics,
        blocked: tile.blocked,
    };

    if (tile.exit) copy.exit = structuredClone(tile.exit);
    if (tile.object) copy.object = { ...tile.object };
    if (tile.npc !== undefined) copy.npc = tile.npc;
    if (tile.trigger !== undefined) copy.trigger = tile.trigger;
    if (tile.spawn) copy.spawn = { ...tile.spawn };

    return copy;
}

export function emptyTile(): ExpandedTile {
    return { graphics: [null, null, null, null], blocked: false };
}

/**
 * Mapa en memoria del editor. Guarda los tiles en un array plano row-major
 * (indice `(y-1)*width + (x-1)`), que para 100x100 son 10.000 entradas.
 *
 * El modelo no conoce el historial: quien muta es responsable de registrar el
 * estado previo en `History` antes de llamar a `set`.
 */
export class EditorMapModel {
    readonly width: number;
    readonly height: number;
    meta: MapMetadata;
    private readonly tiles: ExpandedTile[];

    private constructor(meta: MapMetadata, width: number, height: number, tiles: ExpandedTile[]) {
        this.meta = meta;
        this.width = width;
        this.height = height;
        this.tiles = tiles;
    }

    static fromBundle(bundle: EditorMapBundle): EditorMapModel {
        const total = bundle.width * bundle.height;
        const tiles: ExpandedTile[] = new Array(total);

        for (let index = 0; index < total; index++) {
            const tile = bundle.tiles[index];
            tiles[index] = tile ? cloneTile(tile) : emptyTile();
        }

        return new EditorMapModel({ ...bundle.meta }, bundle.width, bundle.height, tiles);
    }

    inBounds(x: number, y: number): boolean {
        return x >= 1 && y >= 1 && x <= this.width && y <= this.height;
    }

    indexOf(x: number, y: number): number {
        return (y - 1) * this.width + (x - 1);
    }

    coordsOf(index: number): { x: number; y: number } {
        return { x: (index % this.width) + 1, y: Math.floor(index / this.width) + 1 };
    }

    get(x: number, y: number): ExpandedTile | null {
        if (!this.inBounds(x, y)) {
            return null;
        }

        return this.tiles[this.indexOf(x, y)];
    }

    getByIndex(index: number): ExpandedTile | null {
        return this.tiles[index] ?? null;
    }

    setByIndex(index: number, tile: ExpandedTile): void {
        if (index < 0 || index >= this.tiles.length) {
            return;
        }

        this.tiles[index] = tile;
    }

    /** Grh distintos presentes en el mapa, en total y por capa. */
    usedGraphics(): { all: Set<number>; byLayer: Record<LayerIndex, Set<number>> } {
        const all = new Set<number>();
        const byLayer: Record<LayerIndex, Set<number>> = {
            1: new Set(),
            2: new Set(),
            3: new Set(),
            4: new Set(),
        };

        for (const tile of this.tiles) {
            for (let layer = 0; layer < 4; layer++) {
                const grhId = tile.graphics[layer];

                if (grhId !== null && grhId !== undefined) {
                    all.add(grhId);
                    byLayer[(layer + 1) as LayerIndex].add(grhId);
                }
            }
        }

        return { all, byLayer };
    }

    /** Grh de una region rectangular, para cargar texturas del viewport. */
    graphicsInRegion(minX: number, minY: number, maxX: number, maxY: number): Set<number> {
        const result = new Set<number>();
        const x0 = Math.max(1, minX);
        const y0 = Math.max(1, minY);
        const x1 = Math.min(this.width, maxX);
        const y1 = Math.min(this.height, maxY);

        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const tile = this.tiles[this.indexOf(x, y)];

                for (const grhId of tile.graphics) {
                    if (grhId !== null && grhId !== undefined) {
                        result.add(grhId);
                    }
                }
            }
        }

        return result;
    }

    toBundle(): EditorMapBundle {
        return {
            meta: { ...this.meta },
            width: this.width,
            height: this.height,
            tiles: this.tiles.map((tile) => cloneTile(tile)),
        };
    }
}
