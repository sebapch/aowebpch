import type {
    DataNpc,
    EditorHealth,
    EditorMapBundle,
    GameNpcRecord,
    ItemTemplateSummary,
    MapNpcPlacement,
    MapSummary,
} from "./types";

/** Cliente del editor contra las rutas proxy de Next (`/api/editor/*`). */

export class EditorApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "EditorApiError";
        this.status = status;
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...init, cache: "no-store" });
    const text = await response.text();

    let payload: unknown = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        throw new EditorApiError(response.status, `Respuesta no valida del servidor (${response.status}).`);
    }

    if (!response.ok) {
        const message =
            payload && typeof payload === "object" && "error" in payload
                ? String((payload as { error: unknown }).error)
                : `Error ${response.status}`;
        throw new EditorApiError(response.status, message);
    }

    return payload as T;
}

export type EditorSession = {
    isAdmin: boolean;
    characterName: string;
    accountName: string;
};

export function fetchEditorSession(): Promise<EditorSession> {
    return request<EditorSession>("/api/editor/session");
}

export function fetchEditorHealth(): Promise<EditorHealth> {
    return request<EditorHealth>("/api/editor/health");
}

export async function fetchMapList(): Promise<{ maps: MapSummary[]; activeMapIds: number[] }> {
    const data = await request<{ maps: MapSummary[]; activeMapIds?: number[] }>("/api/editor/maps");
    return { maps: data.maps ?? [], activeMapIds: data.activeMapIds ?? [] };
}

export async function fetchActiveMapIds(): Promise<number[]> {
    const { activeMapIds } = await request<{ activeMapIds: number[] }>("/api/editor/active-maps");
    return activeMapIds ?? [];
}

export async function toggleActiveMap(mapId: number, active: boolean): Promise<number[]> {
    const data = await request<{ ok: boolean; activeMapIds: number[] }>("/api/editor/active-maps/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapId, active }),
    });
    return data.activeMapIds ?? [];
}


export function fetchMapBundle(mapId: number): Promise<EditorMapBundle> {
    return request<EditorMapBundle>(`/api/editor/maps/${mapId}`);
}

/** `reloaded` indica si el servidor recargo el mapa en memoria (solo si estaba activo). */
export type SaveMapResult = { bundle: EditorMapBundle; reloaded: boolean };

export function saveMapBundle(mapId: number, bundle: EditorMapBundle): Promise<SaveMapResult> {
    return request<SaveMapResult>(`/api/editor/maps/${mapId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
    });
}

export async function saveMapNpcs(mapId: number, placements: MapNpcPlacement[]): Promise<MapNpcPlacement[]> {
    const { spawns } = await request<{ spawns: MapNpcPlacement[] }>(`/api/editor/maps/${mapId}/npcs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(placements),
    });
    return spawns;
}

export type EdgeLinkResult = {
    side: string;
    neighborMapId: number | null;
    previousNeighborMapId: number | null;
    writtenMapIds: number[];
    tilesWritten: number;
    tilesCleared: number;
    reloadedMapIds: number[];
    /** El mapa editado, ya con las salidas del borde aplicadas. */
    bundle: EditorMapBundle;
};

/**
 * Conecta un borde con el mapa vecino, o lo desconecta con `neighborMapId: null`.
 * Escribe los dos mapas: una transicion de borde solo funciona si existe de los
 * dos lados.
 */
export function linkMapEdge(
    mapId: number,
    side: string,
    neighborMapId: number | null,
): Promise<EdgeLinkResult> {
    return request<EdgeLinkResult>(`/api/editor/maps/${mapId}/edges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, neighborMapId }),
    });
}

export type CreateMapInput = {
    name: string;
    width: number;
    height: number;
    terreno: string;
    zona: string;
    musicNum?: number;
    pk?: number;
};

export async function createMap(input: CreateMapInput): Promise<EditorMapBundle> {
    const { bundle } = await request<{ bundle: EditorMapBundle }>("/api/editor/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    return bundle;
}

export function fetchNpcTemplate(npcIndex: number): Promise<GameNpcRecord> {
    return request<GameNpcRecord>(`/api/editor/npc-templates/${npcIndex}`);
}

export async function saveNpcTemplate(npcIndex: number, data: DataNpc): Promise<GameNpcRecord> {
    const result = await request<{ unchanged: boolean; npc: GameNpcRecord }>(
        `/api/editor/npc-templates/${npcIndex}`,
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        },
    );
    return result.npc;
}

export async function searchItemTemplates(search: string): Promise<ItemTemplateSummary[]> {
    const params = new URLSearchParams();

    if (search) {
        params.set("search", search);
    }

    const { objects } = await request<{ objects: ItemTemplateSummary[] }>(
        `/api/editor/item-templates?${params.toString()}`,
    );
    return objects;
}
