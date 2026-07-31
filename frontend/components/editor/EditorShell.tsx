"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMapBundle, fetchMapList, EditorApiError } from "../../lib/editor/api";
import { LAYER_NAMES, type ExpandedTile, type MapSummary } from "../../lib/editor/types";
import { EditorCanvas, type EditorCanvasHandle } from "./EditorCanvas";
import { TileInspector } from "./TileInspector";
import { EditorMapModel, type LayerIndex } from "./model/EditorMapModel";
import type { LayerVisibility, OverlayFlags } from "./render/EditorScene";

const LAYERS: LayerIndex[] = [1, 2, 3, 4];

const OVERLAY_LABELS: Record<keyof OverlayFlags, string> = {
    grid: "Grilla",
    blocked: "Bloqueos",
    exits: "Salidas",
    objects: "Objetos",
    npcs: "NPCs",
    triggers: "Triggers",
};

export function EditorShell({ initialMapId }: { initialMapId: number }) {
    const [maps, setMaps] = useState<MapSummary[]>([]);
    const [mapId, setMapId] = useState(initialMapId);
    const [model, setModel] = useState<EditorMapModel | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [canvasHandle, setCanvasHandle] = useState<EditorCanvasHandle | null>(null);
    const [zoom, setZoom] = useState(1);

    const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);
    const [selectedTile, setSelectedTile] = useState<{ x: number; y: number } | null>(null);

    const [activeLayer, setActiveLayer] = useState<LayerIndex>(1);
    const [isolateLayer, setIsolateLayer] = useState(false);
    const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
        1: true,
        2: true,
        3: true,
        4: true,
    });
    const [overlays, setOverlays] = useState<OverlayFlags>({
        grid: true,
        blocked: false,
        exits: true,
        objects: true,
        npcs: true,
        triggers: false,
    });

    // Aislar la capa activa atenua las demas en vez de ocultarlas, para no
    // perder la referencia visual de lo que hay alrededor.
    const layerAlpha = useMemo<Record<LayerIndex, number>>(() => {
        if (!isolateLayer) {
            return { 1: 1, 2: 1, 3: 1, 4: 1 };
        }

        return {
            1: activeLayer === 1 ? 1 : 0.25,
            2: activeLayer === 2 ? 1 : 0.25,
            3: activeLayer === 3 ? 1 : 0.25,
            4: activeLayer === 4 ? 1 : 0.25,
        };
    }, [isolateLayer, activeLayer]);

    useEffect(() => {
        let cancelled = false;

        void fetchMapList()
            .then((list) => {
                if (!cancelled) {
                    setMaps(list);
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof EditorApiError ? err.message : "No se pudo listar los mapas.");
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setSelectedTile(null);

        void fetchMapBundle(mapId)
            .then((bundle) => {
                if (!cancelled) {
                    setModel(EditorMapModel.fromBundle(bundle));
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof EditorApiError ? err.message : `No se pudo cargar el mapa ${mapId}.`);
                    setModel(null);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [mapId]);

    const inspectedTile: ExpandedTile | null = useMemo(() => {
        const target = selectedTile ?? hoverTile;

        if (!model || !target) {
            return null;
        }

        return model.get(target.x, target.y);
    }, [model, selectedTile, hoverTile]);

    const inspectedCoords = selectedTile ?? hoverTile;

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
                return;
            }

            if (event.key >= "1" && event.key <= "4") {
                setActiveLayer(Number(event.key) as LayerIndex);
            }

            if (event.key === "`") {
                setOverlays((current) => ({ ...current, grid: !current.grid }));
            }

            if (event.key.toLowerCase() === "k") {
                setOverlays((current) => ({ ...current, blocked: !current.blocked }));
            }

            if (event.key === "Home") {
                canvasHandle?.fitToScreen();
            }
        },
        [canvasHandle],
    );

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    const currentSummary = maps.find((summary) => summary.id === mapId);

    return (
        <div className="flex h-screen flex-col bg-slate-950 text-slate-200">
            <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2">
                <span className="text-sm font-semibold text-slate-100">Editor de mapas</span>

                <select
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
                    value={mapId}
                    onChange={(event) => setMapId(Number(event.target.value))}
                >
                    {maps.length === 0 && <option value={mapId}>Mapa {mapId}</option>}
                    {maps.map((summary) => (
                        <option key={summary.id} value={summary.id}>
                            {summary.id} · {summary.name || "(sin nombre)"}
                        </option>
                    ))}
                </select>

                {currentSummary && (
                    <span className="text-xs text-slate-500">
                        {currentSummary.terreno} · {currentSummary.zona} ·{" "}
                        {currentSummary.pk === 1 ? "zona segura" : "PK"}
                    </span>
                )}

                <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
                    <span>zoom {Math.round(zoom * 100)}%</span>
                    <button
                        type="button"
                        className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800"
                        onClick={() => canvasHandle?.fitToScreen()}
                    >
                        Ajustar (Home)
                    </button>
                </div>
            </header>

            <div className="flex min-h-0 flex-1">
                <aside className="w-56 shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-900 p-3">
                    <h2 className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Capas</h2>
                    <div className="space-y-1">
                        {LAYERS.map((layer) => (
                            <div key={layer} className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="active-layer"
                                    checked={activeLayer === layer}
                                    onChange={() => setActiveLayer(layer)}
                                    title="Capa activa"
                                />
                                <button
                                    type="button"
                                    className={`flex-1 text-left text-xs ${
                                        layerVisibility[layer] ? "text-slate-200" : "text-slate-600 line-through"
                                    }`}
                                    onClick={() =>
                                        setLayerVisibility((current) => ({
                                            ...current,
                                            [layer]: !current[layer],
                                        }))
                                    }
                                >
                                    {layer} · {LAYER_NAMES[layer]}
                                </button>
                            </div>
                        ))}
                    </div>

                    <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                        <input
                            type="checkbox"
                            checked={isolateLayer}
                            onChange={(event) => setIsolateLayer(event.target.checked)}
                        />
                        Aislar capa activa
                    </label>

                    <h2 className="mb-2 mt-5 text-[11px] uppercase tracking-wide text-slate-500">Superposiciones</h2>
                    <div className="space-y-1">
                        {(Object.keys(OVERLAY_LABELS) as Array<keyof OverlayFlags>).map((key) => (
                            <label key={key} className="flex items-center gap-2 text-xs text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={overlays[key]}
                                    onChange={(event) =>
                                        setOverlays((current) => ({ ...current, [key]: event.target.checked }))
                                    }
                                />
                                {OVERLAY_LABELS[key]}
                            </label>
                        ))}
                    </div>

                    <p className="mt-5 text-[11px] leading-relaxed text-slate-600">
                        Rueda: zoom · Boton derecho o central: desplazar · 1-4: capa activa · ` grilla · K bloqueos ·
                        Home: ajustar
                    </p>
                </aside>

                <main className="relative min-w-0 flex-1">
                    {error && (
                        <div className="absolute inset-x-0 top-0 z-10 bg-red-950/90 px-4 py-2 text-sm text-red-200">
                            {error}
                        </div>
                    )}
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/70 text-sm text-slate-400">
                            Cargando mapa {mapId}...
                        </div>
                    )}
                    {model && (
                        <EditorCanvas
                            model={model}
                            layerVisibility={layerVisibility}
                            layerAlpha={layerAlpha}
                            overlays={overlays}
                            onHoverTile={setHoverTile}
                            onPickTile={setSelectedTile}
                            onReady={setCanvasHandle}
                            onZoomChange={setZoom}
                        />
                    )}
                </main>

                <aside className="w-64 shrink-0 overflow-y-auto border-l border-slate-800 bg-slate-900">
                    <h2 className="border-b border-slate-800 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">
                        Tile {selectedTile ? "(seleccionado)" : "(bajo el cursor)"}
                    </h2>
                    <TileInspector
                        tile={inspectedTile}
                        x={inspectedCoords?.x ?? null}
                        y={inspectedCoords?.y ?? null}
                    />
                </aside>
            </div>

            <footer className="flex items-center gap-4 border-t border-slate-800 bg-slate-900 px-4 py-1 font-mono text-[11px] text-slate-500">
                <span>{hoverTile ? `x ${hoverTile.x}  y ${hoverTile.y}` : "—"}</span>
                {model && (
                    <span>
                        mapa {model.meta.id} · {model.width}x{model.height}
                    </span>
                )}
                <span className="ml-auto">solo lectura (M1)</span>
            </footer>
        </div>
    );
}
