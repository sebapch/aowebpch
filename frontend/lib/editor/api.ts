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

export function saveMapBundle(mapId: number, bundle: EditorMapBundle): Promise<EditorMapBundle> {
    return request<EditorMapBundle>(`/api/editor/maps/${mapId}`, {
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
