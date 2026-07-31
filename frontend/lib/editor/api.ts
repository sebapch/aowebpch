import type { EditorHealth, EditorMapBundle, MapSummary } from "./types";

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

export async function fetchMapList(): Promise<MapSummary[]> {
    const { maps } = await request<{ maps: MapSummary[] }>("/api/editor/maps");
    return maps;
}

export function fetchMapBundle(mapId: number): Promise<EditorMapBundle> {
    return request<EditorMapBundle>(`/api/editor/maps/${mapId}`);
}
