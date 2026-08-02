export const MINIMAP_PREVIEW_SIZE = 92;
export const DEFAULT_MAP_GRID_SIZE = 100;
export const MINIMAP_MARKER_MARGIN = 2;
export const WORLD_MAP_MARKER_SIZE = 10;

export const WORLD_MAP_GRID_URL = "/init/world-map.json";
export const WORLD_MAP_GENERAL_GRID_URL = "/init/world-map-grid-general.json";
export const WORLD_MAP_SRC = "/imgs/world-map.png";
export const WORLD_MAP_GENERAL_SRC = "/imgs/world-map-general.png";

export type WorldMapLayoutEntry = {
    id: number;
    gridX: number;
    gridY: number;
};

export type WorldMapGridData = {
    generatedAt?: string;
    totalCols: number;
    totalRows: number;
    maps: WorldMapLayoutEntry[];
};

export type WorldMapConnectedPlayer = {
    name: string;
    map: number;
    pos: { x: number; y: number };
};

export type WorldMapGrid = {
    maps: Map<number, { gridX: number; gridY: number }>;
    mapIdsByGrid: Map<string, number>;
    totalCols: number;
    totalRows: number;
};

export type WorldMapPlayerMarker = {
    id: string;
    left: string;
    top: string;
    title: string;
};

const worldMapGridPromises = new Map<string, Promise<WorldMapGridData>>();

export function loadWorldMapGrid(url: string) {
    if (!worldMapGridPromises.has(url)) {
        worldMapGridPromises.set(
            url,
            fetch(url, {
                cache: "force-cache",
            }).then(async (response) => {
                if (!response.ok) {
                    throw new Error(
                        `No se pudo cargar ${url}: ${response.status}`,
                    );
                }

                return (await response.json()) as WorldMapGridData;
            }),
        );
    }

    return worldMapGridPromises.get(url)!;
}

export function buildWorldMapGrid(
    worldMapGridData: WorldMapGridData,
): WorldMapGrid {
    const maps = new Map<number, { gridX: number; gridY: number }>();
    const mapIdsByGrid = new Map<string, number>();

    for (const map of worldMapGridData.maps) {
        maps.set(map.id, { gridX: map.gridX, gridY: map.gridY });
        mapIdsByGrid.set(`${map.gridX}:${map.gridY}`, map.id);
    }

    return {
        maps,
        mapIdsByGrid,
        totalCols: worldMapGridData.totalCols,
        totalRows: worldMapGridData.totalRows,
    };
}

export function getMinimapFrame(aspectRatio: number) {
    const safeAspectRatio =
        Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;

    if (safeAspectRatio >= 1) {
        const width = MINIMAP_PREVIEW_SIZE;
        const height = MINIMAP_PREVIEW_SIZE / safeAspectRatio;

        return {
            width,
            height,
            leftOffset: 0,
            topOffset: (MINIMAP_PREVIEW_SIZE - height) / 2,
        };
    }

    const width = MINIMAP_PREVIEW_SIZE * safeAspectRatio;
    const height = MINIMAP_PREVIEW_SIZE;

    return {
        width,
        height,
        leftOffset: (MINIMAP_PREVIEW_SIZE - width) / 2,
        topOffset: 0,
    };
}

export function getMinimapMarkerStyle(
    pos: { x: number; y: number } | null | undefined,
    aspectRatio: number,
) {
    if (!pos) {
        return null;
    }

    const maxCoordinate = DEFAULT_MAP_GRID_SIZE;
    const normalizedX = Math.max(
        0,
        Math.min(1, (pos.x - 1) / Math.max(1, maxCoordinate - 1)),
    );
    const normalizedY = Math.max(
        0,
        Math.min(1, (pos.y - 1) / Math.max(1, maxCoordinate - 1)),
    );
    const frame = getMinimapFrame(aspectRatio);
    const usableWidth = Math.max(0, frame.width - MINIMAP_MARKER_MARGIN * 2);
    const usableHeight = Math.max(0, frame.height - MINIMAP_MARKER_MARGIN * 2);

    return {
        left: `${frame.leftOffset + MINIMAP_MARKER_MARGIN + normalizedX * usableWidth}px`,
        top: `${frame.topOffset + MINIMAP_MARKER_MARGIN + normalizedY * usableHeight}px`,
    };
}

export function getWorldMapMarkerStyle(
    worldMapGrid: WorldMapGrid | null,
    mapId: number | null,
    pos: { x: number; y: number } | null | undefined,
) {
    if (!worldMapGrid || !mapId || !pos) {
        return null;
    }

    const mapLayout = worldMapGrid.maps.get(mapId);

    if (!mapLayout) {
        return null;
    }

    const normalizedX = Math.max(
        0,
        Math.min(1, (pos.x - 0.5) / DEFAULT_MAP_GRID_SIZE),
    );
    const normalizedY = Math.max(
        0,
        Math.min(1, (pos.y - 0.5) / DEFAULT_MAP_GRID_SIZE),
    );
    const left =
        ((mapLayout.gridX + normalizedX) / worldMapGrid.totalCols) * 100;
    const top =
        ((mapLayout.gridY + normalizedY) / worldMapGrid.totalRows) * 100;

    return {
        left: `${left}%`,
        top: `${top}%`,
    };
}
