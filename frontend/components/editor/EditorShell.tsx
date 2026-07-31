"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMapBundle, fetchMapList, saveMapBundle, toggleActiveMap, EditorApiError } from "../../lib/editor/api";
import { LAYER_NAMES, type ExpandedTile, type MapSummary, type NpcSpawn, type ObjectInfo } from "../../lib/editor/types";
import type { GraphicsDB } from "../../types/game";
import { loadGraphicsDB } from "../../utils/gameLoader";
import { EditorCanvas, type EditorCanvasHandle, type EditorTool, type PaintMode } from "./EditorCanvas";
import { GraphicsPicker } from "./GraphicsPicker";
import { GraphicsCatalogModal } from "./GraphicsCatalogModal";
import { NpcPanel } from "./NpcPanel";
import { NpcSelectorModal } from "./NpcSelectorModal";
import { TileInspector } from "./TileInspector";
import { History } from "./model/History";
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
    const [activeMapIds, setActiveMapIds] = useState<number[]>([]);
    const [togglingActive, setTogglingActive] = useState(false);
    const [mapId, setMapId] = useState(initialMapId);
    const [model, setModel] = useState<EditorMapModel | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [canvasHandle, setCanvasHandle] = useState<EditorCanvasHandle | null>(null);
    const [zoom, setZoom] = useState(1);

    const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);
    const [selectedTile, setSelectedTile] = useState<{ x: number; y: number } | null>(null);
    const [npcPanelIndex, setNpcPanelIndex] = useState<number | null>(null);
    const [catalogOpen, setCatalogOpen] = useState(false);
    const [graphicsCatalogOpen, setGraphicsCatalogOpen] = useState(false);
    const [movePending, setMovePending] = useState<{
        kind: "spawn" | "object" | "layer";
        layer?: LayerIndex;
        grhId?: number;
        fromX: number;
        fromY: number;
    } | null>(null);    const [activeLayer, setActiveLayer] = useState<LayerIndex>(1);
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

    const [tool, setTool] = useState<EditorTool>("select");
    const [paintMode, setPaintMode] = useState<PaintMode>("graphic");
    const [brushGraphic, setBrushGraphic] = useState<number | null>(null);
    const [brushSize, setBrushSize] = useState<1 | 2 | 3 | 5>(1);
    const [paintToolMode, setPaintToolMode] = useState<"brush" | "bucket">("brush");
    const [graphicsDB, setGraphicsDB] = useState<GraphicsDB | null>(null);

    const [recentGraphics, setRecentGraphics] = useState<number[]>([]);
    const [recentNpcs, setRecentNpcs] = useState<number[]>([]);

    const historyRef = useRef(new History());
    const [revision, setRevision] = useState(0);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

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
            .then(({ maps: list, activeMapIds: activeIds }) => {
                if (!cancelled) {
                    setMaps(list);
                    setActiveMapIds(activeIds);
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

    // Compartida con EditorCanvas: el navegador la cachea, esto no dispara un
    // segundo fetch. Solo la necesita el GraphicsPicker para las miniaturas.
    useEffect(() => {
        let cancelled = false;

        void loadGraphicsDB().then((db) => {
            if (!cancelled) {
                setGraphicsDB(db);
            }
        });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!movePending) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setMovePending(null);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [movePending]);

    const isCurrentMapActive = activeMapIds.includes(mapId);

    const handleToggleActiveMap = async () => {
        setTogglingActive(true);
        try {
            const updated = await toggleActiveMap(mapId, !isCurrentMapActive);
            setActiveMapIds(updated);
        } catch (err: unknown) {
            setError(err instanceof EditorApiError ? err.message : "Error al cambiar estado del mapa.");
        } finally {
            setTogglingActive(false);
        }
    };

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

    // Cada mapa nuevo empieza con su propio historial y sin cambios sin guardar.
    // Esto no se dispara al guardar: el guardado no reemplaza `model`.
    useEffect(() => {
        historyRef.current = new History();
        setDirty(false);
        setSaveError(null);
        setRevision(0);
    }, [model]);

    const inspectedTile: ExpandedTile | null = useMemo(() => {
        const target = selectedTile ?? hoverTile;

        if (!model || !target) {
            return null;
        }

        return model.get(target.x, target.y);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [model, selectedTile, hoverTile, revision]);

    const inspectedCoords = selectedTile ?? hoverTile;

    // Tocar un NPC (click sin arrastrar, o el tile donde quedo tras moverlo)
    // abre su plantilla compartida en un panel.
    useEffect(() => {
        if (!model || !selectedTile) {
            return;
        }

        const tile = model.get(selectedTile.x, selectedTile.y);

        if (tile?.spawn) {
            setNpcPanelIndex(tile.spawn.npcIndex);
        }
        // Se dispara solo con un click nuevo, no con cada edicion posterior:
        // si el usuario cierra el panel, no debe reabrirse solo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTile]);

    const handleEdit = useCallback(() => {
        setDirty(true);
        setRevision((current) => current + 1);
    }, []);

    const pushRecentGraphic = useCallback((grhId: number) => {
        setRecentGraphics((prev) => {
            const filtered = prev.filter((id) => id !== grhId);
            return [grhId, ...filtered].slice(0, 10);
        });
    }, []);

    const pushRecentNpc = useCallback((npcIndex: number) => {
        setRecentNpcs((prev) => {
            const filtered = prev.filter((id) => id !== npcIndex);
            return [npcIndex, ...filtered].slice(0, 10);
        });
    }, []);

    const handlePickGraphic = useCallback(
        (grhId: number) => {
            setBrushGraphic(grhId);
            setTool("paint");
            setPaintMode("graphic");
            pushRecentGraphic(grhId);
        },
        [pushRecentGraphic],
    );

    const handleSelectBrushGraphic = useCallback(
        (grhId: number | null) => {
            setBrushGraphic(grhId);
            if (grhId !== null) {
                pushRecentGraphic(grhId);
            }
        },
        [pushRecentGraphic],
    );

    const handleStartMoveLayer = useCallback((x: number, y: number, layer: LayerIndex, grhId: number) => {
        setMovePending({ kind: "layer", layer, grhId, fromX: x, fromY: y });
    }, []);

    const handleStartMoveObject = useCallback((x: number, y: number) => {
        setMovePending({ kind: "object", fromX: x, fromY: y });
    }, []);

    const handleStartMoveNpc = useCallback((x: number, y: number) => {
        setMovePending({ kind: "spawn", fromX: x, fromY: y });
    }, []);

    const handlePickTile = useCallback(
        (targetTile: { x: number; y: number }) => {
            setSelectedTile(targetTile);

            if (movePending && model) {
                const state = movePending;
                setMovePending(null);

                if (targetTile.x === state.fromX && targetTile.y === state.fromY) {
                    return;
                }

                const sourceTile = model.get(state.fromX, state.fromY);
                if (!sourceTile) return;

                if (state.kind === "layer" && state.layer && state.grhId !== undefined) {
                    const layerIdx = state.layer - 1;
                    const grhToMove = state.grhId;

                    const fromEdit = model.applyEdit(state.fromX, state.fromY, (t) => {
                        t.graphics[layerIdx] = null;
                        return t;
                    });

                    const toEdit = model.applyEdit(targetTile.x, targetTile.y, (t) => {
                        t.graphics[layerIdx] = grhToMove;
                        return t;
                    });

                    if (!fromEdit || !toEdit) return;

                    canvasHandle?.markAllDirty();
                    historyRef.current.push({
                        label: `mover capa ${state.layer}`,
                        undo: () => {
                            model.restoreTile(fromEdit.index, fromEdit.before);
                            model.restoreTile(toEdit.index, toEdit.before);
                            canvasHandle?.markAllDirty();
                            handleEdit();
                        },
                        redo: () => {
                            model.restoreTile(fromEdit.index, fromEdit.after);
                            model.restoreTile(toEdit.index, toEdit.after);
                            canvasHandle?.markAllDirty();
                            handleEdit();
                        },
                    });

                    handleEdit();
                    return;
                }

                const payload = state.kind === "spawn" ? sourceTile.spawn : sourceTile.object;
                if (!payload) return;

                const fromEdit = model.applyEdit(state.fromX, state.fromY, (t) => {
                    if (state.kind === "spawn") t.spawn = undefined;
                    else t.object = undefined;
                    return t;
                });

                const toEdit = model.applyEdit(targetTile.x, targetTile.y, (t) => {
                    if (state.kind === "spawn") t.spawn = { ...(payload as NpcSpawn) };
                    else t.object = { ...(payload as ObjectInfo) };
                    return t;
                });

                if (!fromEdit || !toEdit) return;

                canvasHandle?.markAllDirty();
                historyRef.current.push({
                    label: state.kind === "spawn" ? "mover npc" : "mover objeto",
                    undo: () => {
                        model.restoreTile(fromEdit.index, fromEdit.before);
                        model.restoreTile(toEdit.index, toEdit.before);
                        canvasHandle?.markAllDirty();
                        handleEdit();
                    },
                    redo: () => {
                        model.restoreTile(fromEdit.index, fromEdit.after);
                        model.restoreTile(toEdit.index, toEdit.after);
                        canvasHandle?.markAllDirty();
                        handleEdit();
                    },
                });

                handleEdit();
            }
        },
        [movePending, model, canvasHandle, handleEdit],
    );

    const handleAddNpc = useCallback(
        (x: number, y: number, npcIndex: number) => {
            if (!model) return;
            const edit = model.applyEdit(x, y, (tile) => {
                tile.spawn = { npcIndex, movement: 0 };
                return tile;
            });

            if (!edit) return;

            pushRecentNpc(npcIndex);
            canvasHandle?.markAllDirty();
            historyRef.current.push({
                label: "agregar npc",
                undo: () => {
                    model.restoreTile(edit.index, edit.before);
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
                redo: () => {
                    model.restoreTile(edit.index, edit.after);
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
            });

            handleEdit();
        },
        [model, canvasHandle, handleEdit, pushRecentNpc],
    );

    const handleRemoveNpc = useCallback(
        (x: number, y: number) => {
            if (!model) return;
            const edit = model.applyEdit(x, y, (tile) => {
                tile.spawn = undefined;
                tile.npc = undefined;
                return tile;
            });

            if (!edit) return;

            canvasHandle?.markAllDirty();
            historyRef.current.push({
                label: "eliminar npc",
                undo: () => {
                    model.restoreTile(edit.index, edit.before);
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
                redo: () => {
                    model.restoreTile(edit.index, edit.after);
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
            });

            handleEdit();
        },
        [model, canvasHandle, handleEdit],
    );

    const handleRemoveObject = useCallback(
        (x: number, y: number) => {
            if (!model) return;
            const edit = model.applyEdit(x, y, (tile) => {
                tile.object = undefined;
                return tile;
            });

            if (!edit) return;

            canvasHandle?.markAllDirty();
            historyRef.current.push({
                label: "eliminar objeto",
                undo: () => {
                    model.restoreTile(edit.index, edit.before);
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
                redo: () => {
                    model.restoreTile(edit.index, edit.after);
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
            });

            handleEdit();
        },
        [model, canvasHandle, handleEdit],
    );

    const handleRemoveTrigger = useCallback(
        (x: number, y: number) => {
            if (!model) return;
            const edit = model.applyEdit(x, y, (tile) => {
                tile.trigger = undefined;
                return tile;
            });

            if (!edit) return;

            canvasHandle?.markAllDirty();
            historyRef.current.push({
                label: "eliminar trigger",
                undo: () => {
                    model.restoreTile(edit.index, edit.before);
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
                redo: () => {
                    model.restoreTile(edit.index, edit.after);
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
            });

            handleEdit();
        },
        [model, canvasHandle, handleEdit],
    );

    const handleRemoveExit = useCallback(
        (x: number, y: number) => {
            if (!model) return;
            const edit = model.applyEdit(x, y, (tile) => {
                tile.exit = undefined;
                return tile;
            });

            if (!edit) return;

            canvasHandle?.markAllDirty();
            historyRef.current.push({
                label: "eliminar salida",
                undo: () => {
                    model.restoreTile(edit.index, edit.before);
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
                redo: () => {
                    model.restoreTile(edit.index, edit.after);
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
            });

            handleEdit();
        },
        [model, canvasHandle, handleEdit],
    );

    const handleClearLayer = useCallback(
        (x: number, y: number, layer: LayerIndex) => {
            if (!model) return;
            const edit = model.applyEdit(x, y, (tile) => {
                tile.graphics[layer - 1] = null;
                return tile;
            });

            if (!edit) return;

            canvasHandle?.markAllDirty();
            historyRef.current.push({
                label: `borrar capa ${layer}`,
                undo: () => {
                    model.restoreTile(edit.index, edit.before);
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
                redo: () => {
                    model.restoreTile(edit.index, edit.after);
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
            });

            handleEdit();
        },
        [model, canvasHandle, handleEdit],
    );

    const handleClearTile = useCallback(
        (x: number, y: number) => {
            if (!model) return;
            const edit = model.applyEdit(x, y, (tile) => {
                tile.graphics = [null, null, null, null];
                tile.blocked = false;
                tile.object = undefined;
                tile.spawn = undefined;
                tile.npc = undefined;
                tile.trigger = undefined;
                tile.exit = undefined;
                return tile;
            });

            if (!edit) return;

            canvasHandle?.markAllDirty();
            historyRef.current.push({
                label: "limpiar tile completo",
                undo: () => {
                    model.restoreTile(edit.index, edit.before);
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
                redo: () => {
                    model.restoreTile(edit.index, edit.after);
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
            });

            handleEdit();
        },
        [model, canvasHandle, handleEdit],
    );

    const handleSave = useCallback(async () => {
        if (!model || saving) {
            return;
        }

        setSaving(true);
        setSaveError(null);

        try {
            await saveMapBundle(model.meta.id, model.toBundle());
            setDirty(false);
        } catch (err) {
            setSaveError(err instanceof EditorApiError ? err.message : "No se pudo guardar el mapa.");
        } finally {
            setSaving(false);
        }
    }, [model, saving]);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
                event.preventDefault();
                if (event.shiftKey) {
                    historyRef.current.redo();
                } else {
                    historyRef.current.undo();
                }
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
                event.preventDefault();
                historyRef.current.redo();
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                void handleSave();
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
        [canvasHandle, handleSave],
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
                    {maps.map((summary) => {
                        const isActive = activeMapIds.includes(summary.id);
                        return (
                            <option key={summary.id} value={summary.id}>
                                {isActive ? "🟢" : "⚪"} {summary.id} · {summary.name || "(sin nombre)"}
                            </option>
                        );
                    })}
                </select>

                <button
                    type="button"
                    disabled={togglingActive}
                    onClick={() => void handleToggleActiveMap()}
                    className={`rounded px-2.5 py-1 text-xs font-semibold border transition-colors ${
                        isCurrentMapActive
                            ? "bg-emerald-950/70 border-emerald-600 text-emerald-300 hover:bg-emerald-900/80"
                            : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    title={
                        isCurrentMapActive
                            ? "Mapa cargado en memoria del servidor. Haz clic para desactivarlo."
                            : "Mapa inactivo. Haz clic para cargarlo en la memoria del servidor."
                    }
                >
                    {togglingActive
                        ? "Procesando..."
                        : isCurrentMapActive
                          ? "🟢 Servidor: Activo"
                          : "⚪ Servidor: Inactivo"}
                </button>

                {currentSummary && (
                    <span className="text-xs text-slate-500">
                        {currentSummary.terreno} · {currentSummary.zona} ·{" "}
                        {currentSummary.pk === 1 ? "zona segura" : "PK"}
                    </span>
                )}

                <button
                    type="button"
                    disabled={!model || saving}
                    onClick={() => void handleSave()}
                    className={`rounded px-3 py-1 text-xs font-semibold ${
                        dirty
                            ? "bg-sky-600 text-white hover:bg-sky-500"
                            : "bg-slate-800 text-slate-500"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                    {saving ? "Guardando..." : dirty ? "Guardar (Ctrl+S)" : "Guardado"}
                </button>

                <div className="flex items-center gap-1 text-xs">
                    <button
                        type="button"
                        className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!historyRef.current.canUndo}
                        onClick={() => {
                            historyRef.current.undo();
                        }}
                        title="Deshacer (Ctrl+Z)"
                    >
                        Deshacer
                    </button>
                    <button
                        type="button"
                        className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!historyRef.current.canRedo}
                        onClick={() => {
                            historyRef.current.redo();
                        }}
                        title="Rehacer (Ctrl+Shift+Z)"
                    >
                        Rehacer
                    </button>
                </div>

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
                    <h2 className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Herramienta</h2>
                    <div className="mb-4 flex flex-col gap-1 text-xs">
                        <div className="flex gap-1">
                            <button
                                type="button"
                                className={`flex-1 rounded border px-2 py-1 ${
                                    tool === "select"
                                        ? "border-sky-400 bg-sky-950 text-sky-200 font-medium"
                                        : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                                }`}
                                onClick={() => setTool("select")}
                            >
                                Seleccionar
                            </button>
                            <button
                                type="button"
                                className={`flex-1 rounded border px-2 py-1 ${
                                    tool === "paint"
                                        ? "border-sky-400 bg-sky-950 text-sky-200 font-medium"
                                        : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                                }`}
                                onClick={() => setTool("paint")}
                            >
                                Pintar
                            </button>
                        </div>
                        <button
                            type="button"
                            className={`w-full rounded border px-2 py-1 text-left flex items-center justify-center gap-1.5 ${
                                tool === "eyedropper"
                                    ? "border-amber-400 bg-amber-950 text-amber-200 font-medium"
                                    : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                            }`}
                            onClick={() => setTool("eyedropper")}
                            title="Haz clic en cualquier tile del mapa para tomar su gráfico (o mantén pulsado Alt + Clic)"
                        >
                            🧪 Cuentagotas <span className="text-[10px] text-slate-400">(Alt + Clic)</span>
                        </button>
                    </div>

                    {tool === "select" && (
                        <p className="mb-4 text-[11px] leading-relaxed text-slate-600">
                            Arrastra un NPC u objeto para moverlo a otro tile. Haz clic en un tile para ver su inspección.
                        </p>
                    )}

                    {tool === "eyedropper" && (
                        <p className="mb-4 text-[11px] leading-relaxed text-amber-400/90 bg-amber-950/40 p-2 rounded border border-amber-900/50">
                            Haz clic en cualquier casillero del mapa para copiar su textura e ir a pintar directamente. También puedes mantener <strong>Alt + Clic</strong> en cualquier momento.
                        </p>
                    )}

                    {tool === "paint" && (
                        <div className="mb-4 space-y-2">
                            <div className="flex gap-1 text-xs">
                                <button
                                    type="button"
                                    className={`flex-1 rounded border px-2 py-1 ${
                                        paintMode === "graphic"
                                            ? "border-sky-400 bg-sky-950 text-sky-200"
                                            : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                                    }`}
                                    onClick={() => setPaintMode("graphic")}
                                >
                                    Grafico
                                </button>
                                <button
                                    type="button"
                                    className={`flex-1 rounded border px-2 py-1 ${
                                        paintMode === "blocked"
                                            ? "border-sky-400 bg-sky-950 text-sky-200"
                                            : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                                    }`}
                                    onClick={() => setPaintMode("blocked")}
                                >
                                    Bloqueo
                                </button>
                            </div>

                            {/* Pincel vs Relleno (Bote) */}
                            <div className="flex gap-1 text-xs pt-1">
                                <button
                                    type="button"
                                    className={`flex-1 rounded border px-2 py-1 text-[11px] font-medium flex items-center justify-center gap-1 ${
                                        paintToolMode === "brush"
                                            ? "border-amber-500/80 bg-amber-950/80 text-amber-200"
                                            : "border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700"
                                    }`}
                                    onClick={() => setPaintToolMode("brush")}
                                >
                                    🖌 Pincel
                                </button>
                                <button
                                    type="button"
                                    className={`flex-1 rounded border px-2 py-1 text-[11px] font-medium flex items-center justify-center gap-1 ${
                                        paintToolMode === "bucket"
                                            ? "border-amber-500/80 bg-amber-950/80 text-amber-200"
                                            : "border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700"
                                    }`}
                                    onClick={() => setPaintToolMode("bucket")}
                                    title="Rellenar zona contigua con el mismo terreno (Flood Fill)"
                                >
                                    🪣 Relleno (Bote)
                                </button>
                            </div>

                            {/* Tamaño de pincel */}
                            {paintToolMode === "brush" && (
                                <div className="pt-1">
                                    <span className="text-[10px] uppercase tracking-wide text-slate-500 block mb-1">Tamaño Pincel</span>
                                    <div className="flex gap-1 text-xs">
                                        {([1, 2, 3, 5] as const).map((sz) => (
                                            <button
                                                key={sz}
                                                type="button"
                                                className={`flex-1 rounded border py-0.5 text-[11px] font-mono ${
                                                    brushSize === sz
                                                        ? "border-sky-400 bg-sky-950 text-sky-200 font-bold"
                                                        : "border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700"
                                                }`}
                                                onClick={() => setBrushSize(sz)}
                                            >
                                                {sz}x{sz}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {paintMode === "graphic" && model && (
                                <GraphicsPicker
                                    model={model}
                                    layer={activeLayer}
                                    value={brushGraphic}
                                    onChange={handleSelectBrushGraphic}
                                    onOpenCatalog={() => setGraphicsCatalogOpen(true)}
                                    recentGraphics={recentGraphics}
                                    graphicsDB={graphicsDB}
                                />
                            )}

                            {paintMode === "blocked" && (
                                <p className="text-[11px] leading-relaxed text-slate-600">
                                    Click o arrastre alterna el bloqueo de cada tile tocado.
                                </p>
                            )}
                        </div>
                    )}

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
                                        setLayerVisibility((current) => ({ ...current, [layer]: !current[layer] }))
                                    }
                                >
                                    Capa {layer} ({LAYER_NAMES[layer]})
                                </button>
                                <button
                                    type="button"
                                    className="text-[10px] text-slate-500 hover:text-slate-300"
                                    onClick={() =>
                                        setLayerVisibility((current) => ({ ...current, [layer]: !current[layer] }))
                                    }
                                >
                                    {layerVisibility[layer] ? "ver" : "ocultar"}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 border-t border-slate-800 pt-3">
                        <label className="flex items-center gap-2 text-xs text-slate-400">
                            <input
                                type="checkbox"
                                checked={isolateLayer}
                                onChange={(event) => setIsolateLayer(event.target.checked)}
                            />
                            Aislar capa activa
                        </label>
                    </div>

                    <h2 className="mb-2 mt-4 text-[11px] uppercase tracking-wide text-slate-500">Capas auxiliares</h2>
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
                        Rueda: zoom · Boton derecho o central: desplazar · Alt+Clic: cuentagotas · 1-4: capa activa · ` grilla · K bloqueos ·
                        Home: ajustar · Ctrl+Z / Ctrl+Shift+Z: deshacer/rehacer · Ctrl+S: guardar
                    </p>
                </aside>

                <main className="relative min-w-0 flex-1">
                    {movePending && (
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-lg border border-amber-500/80 bg-slate-900/95 px-4 py-2 text-xs shadow-2xl backdrop-blur-xs">
                            <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                                <span className="animate-pulse">↔</span> Reubicando {
                                    movePending.kind === "spawn"
                                        ? "NPC"
                                        : movePending.kind === "object"
                                          ? "Objeto"
                                          : `Capa ${movePending.layer} (Grh #${movePending.grhId})`
                                } (desde x:{movePending.fromX}, y:{movePending.fromY})
                            </span>
                            <span className="text-slate-300 font-medium">Haz clic en el nuevo casillero de destino</span>
                            <button
                                type="button"
                                onClick={() => setMovePending(null)}
                                className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                            >
                                Cancelar (Esc)
                            </button>
                        </div>
                    )}
                    {(error || saveError) && (
                        <div className="absolute inset-x-0 top-0 z-10 bg-red-950/90 px-4 py-2 text-sm text-red-200">
                            {error ?? saveError}
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
                            tool={tool}
                            activeLayer={activeLayer}
                            paintMode={paintMode}
                            brushGraphic={brushGraphic}
                            brushSize={brushSize}
                            paintToolMode={paintToolMode}
                            history={historyRef.current}
                            onHoverTile={setHoverTile}
                            onPickTile={handlePickTile}
                            onPickGraphic={handlePickGraphic}
                            onReady={setCanvasHandle}
                            onZoomChange={setZoom}
                            onEdit={handleEdit}
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
                        onAddNpc={handleAddNpc}
                        onOpenCatalog={() => setCatalogOpen(true)}
                        recentNpcs={recentNpcs}
                        onStartMoveLayer={handleStartMoveLayer}
                        onStartMoveObject={handleStartMoveObject}
                        onStartMoveNpc={handleStartMoveNpc}
                        onRemoveObject={handleRemoveObject}
                        onRemoveNpc={handleRemoveNpc}
                        onRemoveTrigger={handleRemoveTrigger}
                        onRemoveExit={handleRemoveExit}
                        onClearLayer={handleClearLayer}
                        onClearTile={handleClearTile}
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
                <span className="ml-auto">{dirty ? "cambios sin guardar" : "guardado"}</span>
            </footer>

            {npcPanelIndex !== null && (
                <NpcPanel npcIndex={npcPanelIndex} onClose={() => setNpcPanelIndex(null)} />
            )}

            <NpcSelectorModal
                isOpen={catalogOpen}
                onClose={() => setCatalogOpen(false)}
                onSelectNpc={(npcIndex) => {
                    if (selectedTile) {
                        handleAddNpc(selectedTile.x, selectedTile.y, npcIndex);
                    }
                }}
            />

            <GraphicsCatalogModal
                isOpen={graphicsCatalogOpen}
                onClose={() => setGraphicsCatalogOpen(false)}
                onSelectGraphic={(grhId) => {
                    setBrushGraphic(grhId);
                    setTool("paint");
                    setPaintMode("graphic");
                }}
            />
        </div>
    );
}
