"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    createMap,
    fetchEditorHealth,
    fetchMapBundle,
    fetchMapList,
    saveMapBundle,
    toggleActiveMap,
    EditorApiError,
    type CreateMapInput,
} from "../../lib/editor/api";
import {
    LAYER_NAMES,
    TRIGGER_LABELS,
    type ExpandedTile,
    type MapMetadata,
    type MapSummary,
    type NpcSpawn,
    type ObjectInfo,
    type TileExit,
    type TileExitConfig,
} from "../../lib/editor/types";
import { MAP_SIDES, SIDE_SHORT, describeConnections } from "../../lib/editor/mapEdges";
import type { GraphicsDB } from "../../types/game";
import { loadGraphicsDB } from "../../utils/gameLoader";
import { EditorCanvas, type EditorCanvasHandle, type EditorTool, type PaintMode } from "./EditorCanvas";
import { GraphicsPicker } from "./GraphicsPicker";
import { GraphicsCatalogModal } from "./GraphicsCatalogModal";
import { MapConnectionsPanel } from "./MapConnectionsPanel";
import { MapMetaPanel } from "./MapMetaPanel";
import { MapSearchModal } from "./MapSearchModal";
import { NewMapModal } from "./NewMapModal";
import { NpcPanel } from "./NpcPanel";
import { NpcSelectorModal } from "./NpcSelectorModal";
import { TileInspector } from "./TileInspector";
import { History } from "./model/History";
import { cloneTile, emptyTile, EditorMapModel, type LayerIndex } from "./model/EditorMapModel";
import type { LayerVisibility, OverlayFlags, TileRegion } from "./render/EditorScene";

const LAYERS: LayerIndex[] = [1, 2, 3, 4];

const RECENT_GRAPHICS_KEY = "editor:recentGraphics";
const RECENT_NPCS_KEY = "editor:recentNpcs";

/** Portapapeles de region: gráficos y bloqueo siempre, entidades solo si se pide. */
type ClipboardRegion = { width: number; height: number; tiles: ExpandedTile[]; withEntities: boolean };

type TileEdit = { index: number; before: ExpandedTile; after: ExpandedTile };

function readRecents(key: string): number[] {
    if (typeof window === "undefined") {
        return [];
    }

    try {
        const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)).slice(0, 10) : [];
    } catch {
        return [];
    }
}

function writeRecents(key: string, ids: number[]): void {
    try {
        window.localStorage.setItem(key, JSON.stringify(ids));
    } catch {
        // localStorage lleno o deshabilitado: los recientes son descartables.
    }
}

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
    const [mapSearchOpen, setMapSearchOpen] = useState(false);
    const [quickMapInput, setQuickMapInput] = useState("");
    const [graphicsCatalogOpen, setGraphicsCatalogOpen] = useState(false);
    const [metaPanelOpen, setMetaPanelOpen] = useState(false);
    const [connectionsOpen, setConnectionsOpen] = useState(false);
    const [newMapOpen, setNewMapOpen] = useState(false);
    const [readOnly, setReadOnly] = useState(false);
    const [selection, setSelection] = useState<TileRegion | null>(null);
    const [clipboard, setClipboard] = useState<ClipboardRegion | null>(null);
    const [copyEntities, setCopyEntities] = useState(false);
    const [savedNotice, setSavedNotice] = useState<string | null>(null);
    const [gotoInput, setGotoInput] = useState("");
    /** Coordenada a centrar una vez que termine de cargar otro mapa. */
    const [pendingGoto, setPendingGoto] = useState<{ x: number; y: number } | null>(null);
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
    const [brushTrigger, setBrushTrigger] = useState<number>(6);
    const [brushSize, setBrushSize] = useState<1 | 2 | 3 | 5>(1);
    const [paintToolMode, setPaintToolMode] = useState<"brush" | "bucket">("brush");
    const [graphicsDB, setGraphicsDB] = useState<GraphicsDB | null>(null);

    const [recentGraphics, setRecentGraphics] = useState<number[]>([]);
    const [recentNpcs, setRecentNpcs] = useState<number[]>([]);

    // El historial vive en estado, no en un ref, porque el render lo lee para
    // habilitar los botones y lo pasa al canvas.
    const [history, setHistory] = useState(() => new History());
    const [{ canUndo, canRedo }, setHistoryState] = useState({ canUndo: false, canRedo: false });
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

    // Los recientes se rehidratan en el cliente para no romper el render del
    // servidor, que no tiene localStorage.
    useEffect(() => {
        setRecentGraphics(readRecents(RECENT_GRAPHICS_KEY));
        setRecentNpcs(readRecents(RECENT_NPCS_KEY));
    }, []);

    // Avisa que el editor no puede escribir antes de que alguien pinte media
    // hora y se coma un 403 al guardar.
    useEffect(() => {
        let cancelled = false;

        void fetchEditorHealth()
            .then((health) => {
                if (!cancelled) {
                    setReadOnly(!health.writesAllowed);
                }
            })
            .catch(() => {
                // El guardado igual reporta el error si falla.
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

    useEffect(() => {
        const sync = () => setHistoryState({ canUndo: history.canUndo, canRedo: history.canRedo });

        sync();
        return history.subscribe(sync);
    }, [history]);

    // Sin esto, cerrar la pestana o recargar descarta todo lo pintado en silencio.
    useEffect(() => {
        if (!dirty) {
            return;
        }

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [dirty]);

    const requestMapChange = useCallback(
        (nextMapId: number) => {
            if (nextMapId === mapId) {
                return;
            }

            if (dirty && !window.confirm("Hay cambios sin guardar en este mapa. ¿Descartarlos y cambiar de mapa?")) {
                return;
            }

            setSelection(null);
            setMapId(nextMapId);
        },
        [dirty, mapId],
    );

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
        setHistory(new History());
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
            const next = [grhId, ...prev.filter((id) => id !== grhId)].slice(0, 10);
            writeRecents(RECENT_GRAPHICS_KEY, next);
            return next;
        });
    }, []);

    const pushRecentNpc = useCallback((npcIndex: number) => {
        setRecentNpcs((prev) => {
            const next = [npcIndex, ...prev.filter((id) => id !== npcIndex)].slice(0, 10);
            writeRecents(RECENT_NPCS_KEY, next);
            return next;
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

    /** Registra un lote de ediciones ya aplicadas como un unico comando de historial. */
    const commitEdits = useCallback(
        (label: string, edits: TileEdit[]) => {
            if (!model || edits.length === 0) {
                return;
            }

            canvasHandle?.markAllDirty();
            history.push({
                label,
                undo: () => {
                    for (const edit of edits) {
                        model.restoreTile(edit.index, edit.before);
                    }
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
                redo: () => {
                    for (const edit of edits) {
                        model.restoreTile(edit.index, edit.after);
                    }
                    canvasHandle?.markAllDirty();
                    handleEdit();
                },
            });

            handleEdit();
        },
        [model, canvasHandle, handleEdit, history],
    );

    const commitTileEdit = useCallback(
        (label: string, x: number, y: number, updater: (tile: ExpandedTile) => ExpandedTile) => {
            const edit = model?.applyEdit(x, y, updater);

            if (edit) {
                commitEdits(label, [edit]);
            }
        },
        [model, commitEdits],
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

                    if (fromEdit && toEdit) {
                        commitEdits(`mover capa ${state.layer}`, [fromEdit, toEdit]);
                    }

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

                if (fromEdit && toEdit) {
                    commitEdits(state.kind === "spawn" ? "mover npc" : "mover objeto", [fromEdit, toEdit]);
                }
            }
        },
        [movePending, model, commitEdits],
    );

    const handleAddNpc = useCallback(
        (x: number, y: number, npcIndex: number) => {
            pushRecentNpc(npcIndex);
            commitTileEdit("agregar npc", x, y, (tile) => {
                tile.spawn = { npcIndex, movement: tile.spawn?.movement ?? 0 };
                return tile;
            });
        },
        [commitTileEdit, pushRecentNpc],
    );

    const handleRemoveNpc = useCallback(
        (x: number, y: number) => {
            commitTileEdit("eliminar npc", x, y, (tile) => {
                tile.spawn = undefined;
                tile.npc = undefined;
                return tile;
            });
        },
        [commitTileEdit],
    );

    const handleRemoveObject = useCallback(
        (x: number, y: number) => {
            commitTileEdit("eliminar objeto", x, y, (tile) => {
                tile.object = undefined;
                return tile;
            });
        },
        [commitTileEdit],
    );

    const handleRemoveTrigger = useCallback(
        (x: number, y: number) => {
            commitTileEdit("eliminar trigger", x, y, (tile) => {
                tile.trigger = undefined;
                return tile;
            });
        },
        [commitTileEdit],
    );

    const handleRemoveExit = useCallback(
        (x: number, y: number) => {
            commitTileEdit("eliminar salida", x, y, (tile) => {
                tile.exit = undefined;
                return tile;
            });
        },
        [commitTileEdit],
    );

    const handleSetExit = useCallback(
        (x: number, y: number, destinations: TileExit[]) => {
            if (destinations.length === 0) {
                handleRemoveExit(x, y);
                return;
            }

            const exit: TileExitConfig = destinations.length === 1 ? destinations[0] : { destinations };

            commitTileEdit("editar salida", x, y, (tile) => {
                tile.exit = exit;
                return tile;
            });
        },
        [commitTileEdit, handleRemoveExit],
    );

    const handleSetTrigger = useCallback(
        (x: number, y: number, trigger: number | null) => {
            commitTileEdit(trigger === null ? "eliminar trigger" : "editar trigger", x, y, (tile) => {
                tile.trigger = trigger ?? undefined;
                return tile;
            });
        },
        [commitTileEdit],
    );

    const handleSetObject = useCallback(
        (x: number, y: number, object: ObjectInfo | null) => {
            commitTileEdit(object === null ? "eliminar objeto" : "editar objeto", x, y, (tile) => {
                tile.object = object ?? undefined;
                return tile;
            });
        },
        [commitTileEdit],
    );

    const handleSetSpawnMovement = useCallback(
        (x: number, y: number, movement: number) => {
            commitTileEdit("editar movimiento del npc", x, y, (tile) => {
                if (tile.spawn) {
                    tile.spawn = { ...tile.spawn, movement };
                }
                return tile;
            });
        },
        [commitTileEdit],
    );

    const handleClearLayer = useCallback(
        (x: number, y: number, layer: LayerIndex) => {
            commitTileEdit(`borrar capa ${layer}`, x, y, (tile) => {
                tile.graphics[layer - 1] = null;
                return tile;
            });
        },
        [commitTileEdit],
    );

    const handleClearTile = useCallback(
        (x: number, y: number) => {
            commitTileEdit("limpiar tile completo", x, y, () => emptyTile());
        },
        [commitTileEdit],
    );

    const handleSetMeta = useCallback(
        (meta: MapMetadata) => {
            if (!model) return;
            model.setMeta(meta);
            handleEdit();
        },
        [model, handleEdit],
    );

    // --- Operaciones sobre la seleccion rectangular ---------------------------

    /** Aplica `updater` a cada tile de la region como un unico comando de historial. */
    const commitRegionEdit = useCallback(
        (label: string, region: TileRegion, updater: (tile: ExpandedTile, x: number, y: number) => ExpandedTile) => {
            if (!model) return;

            const edits: TileEdit[] = [];

            for (let y = region.y0; y <= region.y1; y++) {
                for (let x = region.x0; x <= region.x1; x++) {
                    const edit = model.applyEdit(x, y, (tile) => updater(tile, x, y));

                    if (edit) {
                        edits.push(edit);
                    }
                }
            }

            commitEdits(label, edits);
        },
        [model, commitEdits],
    );

    const handleCopyRegion = useCallback(() => {
        if (!model || !selection) return;

        const width = selection.x1 - selection.x0 + 1;
        const height = selection.y1 - selection.y0 + 1;
        const tiles: ExpandedTile[] = [];

        for (let y = selection.y0; y <= selection.y1; y++) {
            for (let x = selection.x0; x <= selection.x1; x++) {
                tiles.push(cloneTile(model.get(x, y) ?? emptyTile()));
            }
        }

        setClipboard({ width, height, tiles, withEntities: copyEntities });
    }, [model, selection, copyEntities]);

    /** Pega el portapapeles con su esquina superior izquierda en (x, y). */
    const handlePasteAt = useCallback(
        (x: number, y: number) => {
            if (!model || !clipboard) return;

            const region: TileRegion = {
                x0: x,
                y0: y,
                x1: Math.min(model.width, x + clipboard.width - 1),
                y1: Math.min(model.height, y + clipboard.height - 1),
            };

            commitRegionEdit("pegar region", region, (tile, tileX, tileY) => {
                const source = clipboard.tiles[(tileY - y) * clipboard.width + (tileX - x)];

                if (!source) {
                    return tile;
                }

                // Sin entidades, pegar solo pisa graficos y bloqueo: lo que ya
                // hubiera en el destino (npc, objeto, salida, trigger) se conserva.
                const pasted = clipboard.withEntities ? cloneTile(source) : tile;

                pasted.graphics = [...source.graphics];
                pasted.blocked = source.blocked;

                return pasted;
            });

            setSelection(region);
        },
        [model, clipboard, commitRegionEdit],
    );

    const handleClearRegion = useCallback(() => {
        if (!selection) return;
        commitRegionEdit("vaciar region", selection, () => emptyTile());
    }, [selection, commitRegionEdit]);

    const handleSetRegionTrigger = useCallback(
        (triggerVal: number | null) => {
            if (!selection) return;

            setOverlays((current) => ({ ...current, triggers: true }));

            const label =
                triggerVal === 6
                    ? "asignar zona segura (trigger 6) a region"
                    : triggerVal === null
                      ? "quitar triggers de la region"
                      : `asignar trigger ${triggerVal} a region`;

            commitRegionEdit(label, selection, (tile) => {
                tile.trigger = triggerVal ?? undefined;
                return tile;
            });
        },
        [selection, commitRegionEdit],
    );

    const handleSetRegionBlocked = useCallback(
        (blocked: boolean) => {
            if (!selection) return;

            setOverlays((current) => ({ ...current, blocked: true }));

            commitRegionEdit(blocked ? "bloquear region" : "desbloquear region", selection, (tile) => {
                tile.blocked = blocked;
                return tile;
            });
        },
        [selection, commitRegionEdit],
    );

    const handleFillRegion = useCallback(() => {
        if (!selection) return;

        if (paintMode === "blocked") {
            handleSetRegionBlocked(true);
            return;
        }

        if (paintMode === "trigger") {
            handleSetRegionTrigger(brushTrigger);
            return;
        }

        const layerIdx = activeLayer - 1;
        const grhId = brushGraphic;

        commitRegionEdit(`rellenar region capa ${activeLayer}`, selection, (tile) => {
            tile.graphics[layerIdx] = grhId;
            return tile;
        });
    }, [selection, commitRegionEdit, paintMode, activeLayer, brushGraphic, brushTrigger, handleSetRegionBlocked, handleSetRegionTrigger]);

    const handleSave = useCallback(async () => {
        if (!model || saving) {
            return;
        }

        setSaving(true);
        setSaveError(null);

        try {
            const { reloaded } = await saveMapBundle(model.meta.id, model.toBundle());
            setDirty(false);
            setSavedNotice(reloaded ? "Guardado y recargado en el servidor" : "Guardado");
        } catch (err) {
            setSaveError(err instanceof EditorApiError ? err.message : "No se pudo guardar el mapa.");
        } finally {
            setSaving(false);
        }
    }, [model, saving]);

    /**
     * Saltar al destino de una salida. Si es otro mapa, el centrado espera a que
     * el modelo nuevo este montado (el efecto de abajo, disparado por `pendingGoto`).
     */
    const handleGoToExit = useCallback(
        (destination: TileExit) => {
            if (destination.map === mapId) {
                canvasHandle?.centerOn(destination.x, destination.y);
                setSelectedTile({ x: destination.x, y: destination.y });
                return;
            }

            if (dirty && !window.confirm("Hay cambios sin guardar en este mapa. ¿Descartarlos e ir al destino?")) {
                return;
            }

            setPendingGoto({ x: destination.x, y: destination.y });
            setSelection(null);
            setMapId(destination.map);
        },
        [mapId, canvasHandle, dirty],
    );

    useEffect(() => {
        if (!pendingGoto || !model || !canvasHandle) {
            return;
        }

        canvasHandle.centerOn(pendingGoto.x, pendingGoto.y);
        setSelectedTile(pendingGoto);
        setPendingGoto(null);
    }, [pendingGoto, model, canvasHandle]);

    const handleCreateMap = useCallback(
        async (input: CreateMapInput) => {
            const bundle = await createMap(input);
            const { maps: list, activeMapIds: activeIds } = await fetchMapList();

            setMaps(list);
            setActiveMapIds(activeIds);
            setNewMapOpen(false);
            setSelection(null);
            setMapId(bundle.meta.id);
        },
        [],
    );

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            const target = event.target;

            // Sin el textarea ni contentEditable, escribir en la descripcion de
            // un NPC mutaba capas y overlays por detras del modal.
            if (
                target instanceof HTMLInputElement ||
                target instanceof HTMLSelectElement ||
                target instanceof HTMLTextAreaElement ||
                (target instanceof HTMLElement && target.isContentEditable)
            ) {
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
                event.preventDefault();
                if (event.shiftKey) {
                    history.redo();
                } else {
                    history.undo();
                }
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
                event.preventDefault();
                history.redo();
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                void handleSave();
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setMapSearchOpen(true);
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
                event.preventDefault();
                handleCopyRegion();
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
                event.preventDefault();

                // Pega en la esquina de la seleccion, o en el tile elegido.
                const anchor = selection
                    ? { x: selection.x0, y: selection.y0 }
                    : (selectedTile ?? null);

                if (anchor) {
                    handlePasteAt(anchor.x, anchor.y);
                }
                return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
                if (selection) {
                    event.preventDefault();
                    handleClearRegion();
                }
                return;
            }

            if (event.key === "Escape" && selection) {
                setSelection(null);
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
        [canvasHandle, handleSave, handleCopyRegion, handlePasteAt, handleClearRegion, selection, selectedTile, history],
    );

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    const currentSummary = maps.find((summary) => summary.id === mapId);

    // Recorre solo las bandas de los bordes; `revision` la recalcula al editar.
    const connections = useMemo(
        () => (model ? describeConnections(model) : {}),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [model, revision],
    );


    return (
        <div className="flex h-screen flex-col bg-slate-950 text-slate-200">
            <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2">
                <span className="text-sm font-semibold text-slate-100">Editor de mapas</span>

                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => {
                            const idx = maps.findIndex((m) => m.id === mapId);
                            if (idx > 0) requestMapChange(maps[idx - 1].id);
                        }}
                        disabled={maps.findIndex((m) => m.id === mapId) <= 0}
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Mapa anterior en la lista"
                    >
                        ←
                    </button>

                    <select
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm max-w-[190px] truncate"
                        value={mapId}
                        onChange={(event) => requestMapChange(Number(event.target.value))}
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
                        onClick={() => {
                            const idx = maps.findIndex((m) => m.id === mapId);
                            if (idx >= 0 && idx < maps.length - 1) requestMapChange(maps[idx + 1].id);
                        }}
                        disabled={maps.findIndex((m) => m.id === mapId) >= maps.length - 1}
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Mapa siguiente en la lista"
                    >
                        →
                    </button>

                    <button
                        type="button"
                        onClick={() => setMapSearchOpen(true)}
                        className="flex items-center gap-1.5 rounded border border-sky-600/80 bg-sky-950/80 px-2.5 py-1 text-xs font-semibold text-sky-200 hover:bg-sky-900 transition-colors shadow-sm"
                        title="Buscar cualquier mapa por nombre o número (Ctrl+K)"
                    >
                        🔍 Buscar mapa <kbd className="rounded bg-slate-800 px-1 py-0.5 text-[10px] font-mono text-slate-300">Ctrl+K</kbd>
                    </button>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            const targetId = Number.parseInt(quickMapInput, 10);
                            if (Number.isInteger(targetId) && targetId > 0) {
                                requestMapChange(targetId);
                                setQuickMapInput("");
                            }
                        }}
                        className="flex items-center gap-1"
                    >
                        <input
                            type="number"
                            min={1}
                            placeholder="Ir a #..."
                            value={quickMapInput}
                            onChange={(e) => setQuickMapInput(e.target.value)}
                            className="w-16 rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                            title="Escribe el número de mapa (ej. 276) y presiona Enter"
                        />
                        <button type="submit" className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700 font-semibold">
                            Ir
                        </button>
                    </form>
                </div>

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

                <button
                    type="button"
                    disabled={!model}
                    onClick={() => setMetaPanelOpen(true)}
                    className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Editar nombre, terreno, zona y niveles del mapa"
                >
                    Propiedades
                </button>

                <button
                    type="button"
                    disabled={!model}
                    onClick={() => setConnectionsOpen(true)}
                    className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    title="A que mapa se sale por cada borde"
                >
                    Conexiones
                    <span className="ml-1.5 font-mono text-[10px] text-slate-500">
                        {MAP_SIDES.map((side) => `${SIDE_SHORT[side]}:${connections[side]?.mapId ?? "—"}`).join(" ")}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => {
                        if (!dirty || window.confirm("Hay cambios sin guardar. ¿Descartarlos y crear un mapa nuevo?")) {
                            setNewMapOpen(true);
                        }
                    }}
                    className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                    + Nuevo mapa
                </button>

                {readOnly && (
                    <span
                        className="rounded border border-amber-700 bg-amber-950/70 px-2 py-1 text-[11px] font-semibold text-amber-300"
                        title="El servidor rechaza escrituras: los cambios no se van a poder guardar."
                    >
                        Solo lectura
                    </span>
                )}

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
                        disabled={!canUndo}
                        onClick={() => history.undo()}
                        title="Deshacer (Ctrl+Z)"
                    >
                        Deshacer
                    </button>
                    <button
                        type="button"
                        className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!canRedo}
                        onClick={() => history.redo()}
                        title="Rehacer (Ctrl+Shift+Z)"
                    >
                        Rehacer
                    </button>
                </div>

                <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
                    <form
                        className="flex items-center gap-1"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const [rawX, rawY] = gotoInput.split(/[\s,;]+/);
                            const targetX = Number.parseInt(rawX ?? "", 10);
                            const targetY = Number.parseInt(rawY ?? "", 10);

                            if (model?.inBounds(targetX, targetY)) {
                                canvasHandle?.centerOn(targetX, targetY);
                                setSelectedTile({ x: targetX, y: targetY });
                            }
                        }}
                    >
                        <input
                            className="w-20 rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-[11px]"
                            placeholder="x, y"
                            value={gotoInput}
                            onChange={(event) => setGotoInput(event.target.value)}
                            title="Ir a una coordenada del mapa"
                        />
                        <button type="submit" className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800">
                            Ir
                        </button>
                    </form>
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
                            className={`w-full rounded border px-2 py-1 flex items-center justify-center gap-1.5 ${
                                tool === "region"
                                    ? "border-sky-400 bg-sky-950 text-sky-200 font-medium"
                                    : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                            }`}
                            onClick={() => setTool("region")}
                            title="Arrastra para seleccionar un rectángulo de tiles"
                        >
                            ⬚ Región
                        </button>
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
                        <button
                            type="button"
                            className="w-full rounded border border-amber-600/80 bg-amber-950/60 px-2 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-900 transition-colors flex items-center justify-center gap-1.5"
                            onClick={() => setCatalogOpen(true)}
                            title="Abrir catálogo completo de NPCs para elegir y colocar"
                        >
                            📋 Catálogo de NPCs
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

                    {tool === "region" && (
                        <div className="mb-4 space-y-2.5 rounded border border-sky-900/50 bg-sky-950/30 p-2.5">
                            <p className="text-[11px] leading-relaxed text-sky-300/90 font-medium">
                                {selection
                                    ? `${selection.x1 - selection.x0 + 1} x ${selection.y1 - selection.y0 + 1} tiles (${(selection.x1 - selection.x0 + 1) * (selection.y1 - selection.y0 + 1)} casilleros)`
                                    : "Arrastra sobre el mapa para seleccionar un rectángulo de casilleros."}
                            </p>

                            {/* Acciones principales de Zona Segura y Triggers en la región */}
                            <div className="space-y-1.5 pt-1 border-t border-sky-900/40">
                                <span className="text-[10px] uppercase font-bold text-slate-400 block">Triggers y Zona Segura</span>

                                <button
                                    type="button"
                                    disabled={!selection}
                                    onClick={() => handleSetRegionTrigger(6)}
                                    className="w-full rounded-lg border border-emerald-600/90 bg-emerald-950/90 px-2.5 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-900 transition-colors flex items-center justify-center gap-1.5 shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="Asignar Trigger 6 (Zona Segura / Sin PK) a todos los tiles de la selección"
                                >
                                    🛡️ Asignar Zona Segura (Trigger 6)
                                </button>

                                <div className="flex gap-1">
                                    <select
                                        disabled={!selection}
                                        className="flex-1 min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-fuchsia-300 disabled:opacity-40"
                                        value={brushTrigger}
                                        onChange={(e) => setBrushTrigger(Number(e.target.value))}
                                    >
                                        {Object.entries(TRIGGER_LABELS).map(([val, label]) => (
                                            <option key={val} value={val}>
                                                {label}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        disabled={!selection}
                                        onClick={() => handleSetRegionTrigger(brushTrigger)}
                                        className="rounded border border-fuchsia-700 bg-fuchsia-950 px-2.5 py-1 text-xs font-semibold text-fuchsia-200 hover:bg-fuchsia-900 disabled:opacity-40 shrink-0"
                                        title="Aplicar el trigger seleccionado a la región"
                                    >
                                        Aplicar
                                    </button>
                                </div>

                                <button
                                    type="button"
                                    disabled={!selection}
                                    onClick={() => handleSetRegionTrigger(null)}
                                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                                >
                                    ❌ Quitar Triggers de Región
                                </button>
                            </div>

                            {/* Acciones de Bloqueos en la región */}
                            <div className="space-y-1.5 pt-1.5 border-t border-sky-900/40">
                                <span className="text-[10px] uppercase font-bold text-slate-400 block">Bloqueos</span>
                                <div className="grid grid-cols-2 gap-1 text-[11px]">
                                    <button
                                        type="button"
                                        disabled={!selection}
                                        onClick={() => handleSetRegionBlocked(true)}
                                        className="rounded border border-rose-800/80 bg-rose-950/70 px-2 py-1 font-semibold text-rose-200 hover:bg-rose-900 disabled:opacity-40"
                                    >
                                        🔒 Bloquear
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!selection}
                                        onClick={() => handleSetRegionBlocked(false)}
                                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                                    >
                                        🔓 Desbloquear
                                    </button>
                                </div>
                            </div>

                            {/* Edición gráfica y portapapeles */}
                            <div className="space-y-1.5 pt-1.5 border-t border-sky-900/40">
                                <label className="flex items-center gap-2 text-[11px] text-slate-400">
                                    <input
                                        type="checkbox"
                                        checked={copyEntities}
                                        onChange={(event) => setCopyEntities(event.target.checked)}
                                    />
                                    Copiar también entidades
                                </label>

                                <div className="grid grid-cols-2 gap-1 text-[11px]">
                                    <button
                                        type="button"
                                        disabled={!selection}
                                        onClick={handleCopyRegion}
                                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 hover:bg-slate-700 disabled:opacity-40"
                                        title="Ctrl+C"
                                    >
                                        Copiar
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!clipboard || !selection}
                                        onClick={() => selection && handlePasteAt(selection.x0, selection.y0)}
                                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 hover:bg-slate-700 disabled:opacity-40"
                                        title="Ctrl+V"
                                    >
                                        Pegar
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!selection}
                                        onClick={handleFillRegion}
                                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 hover:bg-slate-700 disabled:opacity-40"
                                        title={`Rellenar la región seleccionada según el modo activo (${paintMode})`}
                                    >
                                        Rellenar
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!selection}
                                        onClick={handleClearRegion}
                                        className="rounded border border-red-800/80 bg-red-950/60 px-2 py-1 text-red-300 hover:bg-red-900 disabled:opacity-40"
                                        title="Supr"
                                    >
                                        Vaciar
                                    </button>
                                </div>
                            </div>

                            {clipboard && (
                                <p className="text-[10px] text-slate-500">
                                    Portapapeles: {clipboard.width}x{clipboard.height}
                                    {clipboard.withEntities ? " (con entidades)" : ""}
                                </p>
                            )}
                        </div>
                    )}

                    {tool === "paint" && (
                        <div className="mb-4 space-y-2">
                            <div className="flex gap-1 text-xs">
                                <button
                                    type="button"
                                    className={`flex-1 rounded border px-1.5 py-1 text-[11px] ${
                                        paintMode === "graphic"
                                            ? "border-sky-400 bg-sky-950 text-sky-200 font-semibold"
                                            : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                                    }`}
                                    onClick={() => setPaintMode("graphic")}
                                >
                                    Gráfico
                                </button>
                                <button
                                    type="button"
                                    className={`flex-1 rounded border px-1.5 py-1 text-[11px] ${
                                        paintMode === "blocked"
                                            ? "border-sky-400 bg-sky-950 text-sky-200 font-semibold"
                                            : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                                    }`}
                                    onClick={() => setPaintMode("blocked")}
                                >
                                    Bloqueo
                                </button>
                                <button
                                    type="button"
                                    className={`flex-1 rounded border px-1.5 py-1 text-[11px] ${
                                        paintMode === "trigger"
                                            ? "border-fuchsia-400 bg-fuchsia-950 text-fuchsia-200 font-semibold"
                                            : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                                    }`}
                                    onClick={() => {
                                        setPaintMode("trigger");
                                        setOverlays((current) => ({ ...current, triggers: true }));
                                    }}
                                >
                                    Trigger
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
                                    title="Rellenar zona contigua con el mismo modo (Flood Fill)"
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

                            {paintMode === "trigger" && (
                                <div className="space-y-2 pt-1">
                                    <span className="text-[10px] uppercase tracking-wide text-slate-500 block">Trigger Activo</span>
                                    <select
                                        className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-fuchsia-300"
                                        value={brushTrigger}
                                        onChange={(e) => setBrushTrigger(Number(e.target.value))}
                                    >
                                        {Object.entries(TRIGGER_LABELS).map(([val, label]) => (
                                            <option key={val} value={val}>
                                                {label}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] leading-relaxed text-fuchsia-300/80 bg-fuchsia-950/40 p-2 rounded border border-fuchsia-900/50">
                                        Pinta o usa el bote de relleno 🪣 para asignar <strong>{TRIGGER_LABELS[brushTrigger] ?? `Trigger ${brushTrigger}`}</strong> directamente en el mapa.
                                    </p>
                                </div>
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
                        Home: ajustar · Ctrl+Z / Ctrl+Shift+Z: deshacer/rehacer · Ctrl+S: guardar · Ctrl+C / Ctrl+V: copiar y pegar region ·
                        Supr: vaciar region · Esc: quitar seleccion
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
                            brushTrigger={brushTrigger}
                            brushSize={brushSize}
                            paintToolMode={paintToolMode}
                            selection={selection}
                            history={history}
                            onHoverTile={setHoverTile}
                            onPickTile={handlePickTile}
                            onPickGraphic={handlePickGraphic}
                            onSelectRegion={setSelection}
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
                        maps={maps}
                        onSetExit={handleSetExit}
                        onSetTrigger={handleSetTrigger}
                        onSetObject={handleSetObject}
                        onSetSpawnMovement={handleSetSpawnMovement}
                        onGoToExit={handleGoToExit}
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
                {clipboard && (
                    <span>
                        portapapeles {clipboard.width}x{clipboard.height}
                    </span>
                )}
                <span className="ml-auto">{dirty ? "cambios sin guardar" : (savedNotice ?? "guardado")}</span>
            </footer>

            {npcPanelIndex !== null && (
                <NpcPanel npcIndex={npcPanelIndex} onClose={() => setNpcPanelIndex(null)} />
            )}

            <NpcSelectorModal
                isOpen={catalogOpen}
                onClose={() => setCatalogOpen(false)}
                onSelectNpc={(npcIndex) => {
                    const target = selectedTile ?? hoverTile ?? { x: 50, y: 50 };
                    setSelectedTile(target);
                    handleAddNpc(target.x, target.y, npcIndex);
                }}
            />

            <MapSearchModal
                isOpen={mapSearchOpen}
                onClose={() => setMapSearchOpen(false)}
                maps={maps}
                activeMapIds={activeMapIds}
                currentMapId={mapId}
                onSelectMap={(targetMapId) => requestMapChange(targetMapId)}
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

            {metaPanelOpen && model && (
                <MapMetaPanel meta={model.meta} onChange={handleSetMeta} onClose={() => setMetaPanelOpen(false)} />
            )}

            {connectionsOpen && model && (
                <MapConnectionsPanel
                    model={model}
                    maps={maps}
                    dirty={dirty}
                    onLinked={(bundle) => {
                        // El endpoint ya escribio a disco: reemplazamos el modelo
                        // por lo que quedo guardado y arrancamos historial limpio.
                        setModel(EditorMapModel.fromBundle(bundle));
                        setSelection(null);
                    }}
                    onGoToMap={(targetMapId) => {
                        setConnectionsOpen(false);
                        requestMapChange(targetMapId);
                    }}
                    onClose={() => setConnectionsOpen(false)}
                />
            )}

            <NewMapModal isOpen={newMapOpen} onClose={() => setNewMapOpen(false)} onCreate={handleCreateMap} />
        </div>
    );
}
