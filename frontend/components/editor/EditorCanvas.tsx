"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import { loadBodiesDB, loadGraphicsDB, loadHeadsDB, loadNPCsDB } from "../../utils/gameLoader";
import { TILE_SIZE } from "../../lib/viewport";
import type { ExpandedTile, NpcSpawn, ObjectInfo } from "../../lib/editor/types";
import type { EditorMapModel, LayerIndex } from "./model/EditorMapModel";
import type { History } from "./model/History";
import { EditorScene, type LayerVisibility, type OverlayFlags } from "./render/EditorScene";
import { EditorTextureCache } from "./render/editorTextures";

export type EditorTool = "select" | "paint";
export type PaintMode = "graphic" | "blocked";

export type EditorCanvasHandle = {
    fitToScreen: () => void;
    markAllDirty: () => void;
};

type Props = {
    model: EditorMapModel;
    layerVisibility: LayerVisibility;
    layerAlpha: Record<LayerIndex, number>;
    overlays: OverlayFlags;
    tool: EditorTool;
    activeLayer: LayerIndex;
    paintMode: PaintMode;
    brushGraphic: number | null;
    history: History;
    onHoverTile: (tile: { x: number; y: number } | null) => void;
    onPickTile: (tile: { x: number; y: number }) => void;
    onReady?: (handle: EditorCanvasHandle) => void;
    onZoomChange?: (zoom: number) => void;
    /** Se dispara despues de cualquier mutacion aplicada o deshecha/rehecha. */
    onEdit: () => void;
};

type PaintStrokeEntry = { x: number; y: number; before: ExpandedTile; after: ExpandedTile };

type EntityDragState = {
    phase: "maybe" | "dragging";
    startClientX: number;
    startClientY: number;
    fromX: number;
    fromY: number;
    kind: "spawn" | "object";
};

const DRAG_THRESHOLD_PX = 4;

export function EditorCanvas({
    model,
    layerVisibility,
    layerAlpha,
    overlays,
    tool,
    activeLayer,
    paintMode,
    brushGraphic,
    history,
    onHoverTile,
    onPickTile,
    onReady,
    onZoomChange,
    onEdit,
}: Props) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const appRef = useRef<Application | null>(null);
    const sceneRef = useRef<EditorScene | null>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [errorMessage, setErrorMessage] = useState("");

    // Refs para que el bucle y los handlers vean siempre el valor actual sin
    // recrear la aplicacion de Pixi en cada render.
    const onHoverRef = useRef(onHoverTile);
    const onPickRef = useRef(onPickTile);
    const onZoomRef = useRef(onZoomChange);
    const onEditRef = useRef(onEdit);
    const toolRef = useRef(tool);
    const activeLayerRef = useRef(activeLayer);
    const paintModeRef = useRef(paintMode);
    const brushGraphicRef = useRef(brushGraphic);
    const modelRef = useRef(model);
    const historyRef = useRef(history);

    useEffect(() => {
        onHoverRef.current = onHoverTile;
        onPickRef.current = onPickTile;
        onZoomRef.current = onZoomChange;
        onEditRef.current = onEdit;
        toolRef.current = tool;
        activeLayerRef.current = activeLayer;
        paintModeRef.current = paintMode;
        brushGraphicRef.current = brushGraphic;
        modelRef.current = model;
        historyRef.current = history;
    }, [onHoverTile, onPickTile, onZoomChange, onEdit, tool, activeLayer, paintMode, brushGraphic, model, history]);

    useEffect(() => {
        let cancelled = false;
        const host = hostRef.current;

        if (!host) {
            return;
        }

        const app = new Application();

        void (async () => {
            try {
                await app.init({
                    background: 0x11141a,
                    antialias: false,
                    resizeTo: host,
                    preference: "webgl",
                });

                if (cancelled) {
                    app.destroy(true, { children: true });
                    return;
                }

                // Las DBs de NPC son opcionales para el editor: si fallan, se
                // sigue pudiendo editar el mapa, solo sin el sprite del NPC
                // (queda el badge de color como referencia).
                const [graphicsDB, npcsDB, bodiesDB, headsDB] = await Promise.all([
                    loadGraphicsDB(),
                    loadNPCsDB().catch(() => undefined),
                    loadBodiesDB().catch(() => undefined),
                    loadHeadsDB().catch(() => undefined),
                ]);

                if (cancelled) {
                    app.destroy(true, { children: true });
                    return;
                }

                host.appendChild(app.canvas);
                app.canvas.style.width = "100%";
                app.canvas.style.height = "100%";
                app.canvas.style.display = "block";

                const textures = new EditorTextureCache(graphicsDB);
                const scene = new EditorScene(app, textures, model, { npcsDB, bodiesDB, headsDB });
                scene.fitToScreen();

                appRef.current = app;
                sceneRef.current = scene;

                app.ticker.add(() => scene.update());

                // Acceso desde la consola para depurar la escena en desarrollo.
                if (process.env.NODE_ENV !== "production") {
                    (window as unknown as Record<string, unknown>).__editor = { app, scene, textures };
                }

                setStatus("ready");
                onZoomRef.current?.(scene.getZoom());
                onReady?.({
                    fitToScreen: () => {
                        scene.fitToScreen();
                        onZoomRef.current?.(scene.getZoom());
                    },
                    markAllDirty: () => scene.markAllDirty(),
                });
            } catch (error) {
                if (cancelled) {
                    return;
                }

                console.error("No se pudo inicializar el editor:", error);
                setErrorMessage(error instanceof Error ? error.message : "Error desconocido");
                setStatus("error");
            }
        })();

        return () => {
            cancelled = true;
            sceneRef.current?.destroy();
            sceneRef.current = null;

            if (appRef.current) {
                appRef.current.destroy(true, { children: true });
                appRef.current = null;
            }
        };
        // La escena se crea una sola vez; los cambios de modelo se propagan
        // con el efecto de abajo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        sceneRef.current?.setModel(model);
        sceneRef.current?.fitToScreen();
        onZoomRef.current?.(sceneRef.current?.getZoom() ?? 1);
    }, [model]);

    useEffect(() => {
        sceneRef.current?.setLayerVisibility(layerVisibility);
    }, [layerVisibility]);

    useEffect(() => {
        sceneRef.current?.setLayerAlpha(layerAlpha);
    }, [layerAlpha]);

    useEffect(() => {
        sceneRef.current?.setOverlays(overlays);
    }, [overlays]);

    const panState = useRef<{ active: boolean; lastX: number; lastY: number }>({
        active: false,
        lastX: 0,
        lastY: 0,
    });
    const paintState = useRef<{ active: boolean; touched: Map<number, PaintStrokeEntry> } | null>(null);
    const dragState = useRef<EntityDragState | null>(null);

    const toLocal = useCallback((event: React.PointerEvent | React.MouseEvent) => {
        const host = hostRef.current;

        if (!host) {
            return { x: 0, y: 0 };
        }

        const rect = host.getBoundingClientRect();

        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }, []);

    /** Pinta (o alterna bloqueo de) un tile, si todavia no fue tocado en este trazo. */
    const applyPaintAtTile = useCallback((x: number, y: number) => {
        const stroke = paintState.current;
        const model = modelRef.current;

        if (!stroke) {
            return;
        }

        const index = model.indexOf(x, y);

        if (stroke.touched.has(index)) {
            return;
        }

        const mode = paintModeRef.current;
        const layer = activeLayerRef.current;
        const graphic = brushGraphicRef.current;

        const edit = model.applyEdit(x, y, (tile) => {
            if (mode === "blocked") {
                tile.blocked = !tile.blocked;
            } else {
                tile.graphics[layer - 1] = graphic;
            }
            return tile;
        });

        if (!edit) {
            return;
        }

        stroke.touched.set(index, { x, y, before: edit.before, after: edit.after });
        sceneRef.current?.markTileDirty(x, y);
    }, []);

    const commitPaintStroke = useCallback(() => {
        const stroke = paintState.current;
        paintState.current = null;

        if (!stroke || stroke.touched.size === 0) {
            return;
        }

        const entries = [...stroke.touched.values()];
        const model = modelRef.current;

        historyRef.current.push({
            label: "pintar",
            undo: () => {
                for (const entry of entries) {
                    model.restoreTile(model.indexOf(entry.x, entry.y), entry.before);
                    sceneRef.current?.markTileDirty(entry.x, entry.y);
                }
                onEditRef.current();
            },
            redo: () => {
                for (const entry of entries) {
                    model.restoreTile(model.indexOf(entry.x, entry.y), entry.after);
                    sceneRef.current?.markTileDirty(entry.x, entry.y);
                }
                onEditRef.current();
            },
        });

        onEditRef.current();
    }, []);

    const isValidDropTarget = useCallback((tile: { x: number; y: number } | null, state: EntityDragState) => {
        if (!tile) {
            return false;
        }

        if (tile.x === state.fromX && tile.y === state.fromY) {
            return false;
        }

        const targetTile = modelRef.current.get(tile.x, tile.y);

        if (!targetTile || targetTile.blocked) {
            return false;
        }

        if (state.kind === "spawn" && targetTile.spawn) {
            return false;
        }

        if (state.kind === "object" && targetTile.object) {
            return false;
        }

        return true;
    }, []);

    const commitEntityMove = useCallback((state: EntityDragState, target: { x: number; y: number }) => {
        const model = modelRef.current;
        const source = model.get(state.fromX, state.fromY);
        const payload = state.kind === "spawn" ? source?.spawn : source?.object;

        if (!payload) {
            return;
        }

        const fromEdit = model.applyEdit(state.fromX, state.fromY, (tile) => {
            if (state.kind === "spawn") {
                tile.spawn = undefined;
            } else {
                tile.object = undefined;
            }
            return tile;
        });

        const toEdit = model.applyEdit(target.x, target.y, (tile) => {
            if (state.kind === "spawn") {
                tile.spawn = { ...(payload as NpcSpawn) };
            } else {
                tile.object = { ...(payload as ObjectInfo) };
            }
            return tile;
        });

        if (!fromEdit || !toEdit) {
            return;
        }

        sceneRef.current?.markTileDirty(state.fromX, state.fromY);
        sceneRef.current?.markTileDirty(target.x, target.y);

        historyRef.current.push({
            label: state.kind === "spawn" ? "mover npc" : "mover objeto",
            undo: () => {
                model.restoreTile(fromEdit.index, fromEdit.before);
                model.restoreTile(toEdit.index, toEdit.before);
                sceneRef.current?.markTileDirty(state.fromX, state.fromY);
                sceneRef.current?.markTileDirty(target.x, target.y);
                onEditRef.current();
            },
            redo: () => {
                model.restoreTile(fromEdit.index, fromEdit.after);
                model.restoreTile(toEdit.index, toEdit.after);
                sceneRef.current?.markTileDirty(state.fromX, state.fromY);
                sceneRef.current?.markTileDirty(target.x, target.y);
                onEditRef.current();
            },
        });

        onPickRef.current(target);
        onEditRef.current();
    }, []);

    const handlePointerDown = useCallback(
        (event: React.PointerEvent) => {
            const scene = sceneRef.current;

            if (!scene) {
                return;
            }

            // Boton del medio o secundario: desplazar. Principal: seleccionar/pintar/mover.
            if (event.button === 1 || event.button === 2) {
                panState.current = { active: true, lastX: event.clientX, lastY: event.clientY };
                (event.target as Element).setPointerCapture?.(event.pointerId);
                event.preventDefault();
                return;
            }

            if (event.button !== 0) {
                return;
            }

            const local = toLocal(event);
            const tile = scene.screenToTile(local.x, local.y);

            if (!tile) {
                return;
            }

            if (toolRef.current === "paint") {
                (event.target as Element).setPointerCapture?.(event.pointerId);
                paintState.current = { active: true, touched: new Map() };
                applyPaintAtTile(tile.x, tile.y);
                return;
            }

            const modelTile = modelRef.current.get(tile.x, tile.y);

            if (modelTile?.spawn || modelTile?.object) {
                (event.target as Element).setPointerCapture?.(event.pointerId);
                dragState.current = {
                    phase: "maybe",
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    fromX: tile.x,
                    fromY: tile.y,
                    kind: modelTile.spawn ? "spawn" : "object",
                };
                return;
            }

            onPickRef.current(tile);
        },
        [toLocal, applyPaintAtTile],
    );

    const handlePointerMove = useCallback(
        (event: React.PointerEvent) => {
            const scene = sceneRef.current;

            if (!scene) {
                return;
            }

            if (panState.current.active) {
                scene.panByScreenDelta(event.clientX - panState.current.lastX, event.clientY - panState.current.lastY);
                panState.current.lastX = event.clientX;
                panState.current.lastY = event.clientY;
                return;
            }

            if (paintState.current?.active) {
                const local = toLocal(event);
                const tile = scene.screenToTile(local.x, local.y);
                if (tile) {
                    applyPaintAtTile(tile.x, tile.y);
                    onHoverRef.current(tile);
                }
                return;
            }

            if (dragState.current) {
                const state = dragState.current;
                const dx = event.clientX - state.startClientX;
                const dy = event.clientY - state.startClientY;

                if (state.phase === "maybe" && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
                    state.phase = "dragging";
                }

                if (state.phase === "dragging") {
                    const local = toLocal(event);
                    const tile = scene.screenToTile(local.x, local.y);
                    scene.setHover(tile);
                    onHoverRef.current(tile);
                }
                return;
            }

            const local = toLocal(event);
            const tile = scene.screenToTile(local.x, local.y);
            scene.setHover(tile);
            onHoverRef.current(tile);
        },
        [toLocal, applyPaintAtTile],
    );

    const handlePointerUp = useCallback(
        (event: React.PointerEvent) => {
            if (panState.current.active) {
                panState.current.active = false;
                return;
            }

            if (paintState.current?.active) {
                commitPaintStroke();
                return;
            }

            if (dragState.current) {
                const state = dragState.current;
                dragState.current = null;

                if (state.phase !== "dragging") {
                    onPickRef.current({ x: state.fromX, y: state.fromY });
                    return;
                }

                const scene = sceneRef.current;
                const local = toLocal(event);
                const tile = scene?.screenToTile(local.x, local.y) ?? null;

                if (tile && isValidDropTarget(tile, state)) {
                    commitEntityMove(state, tile);
                }
            }
        },
        [commitPaintStroke, isValidDropTarget, commitEntityMove, toLocal],
    );

    const endPan = useCallback(() => {
        panState.current.active = false;
    }, []);

    const handleWheel = useCallback((event: React.WheelEvent) => {
        const scene = sceneRef.current;
        const host = hostRef.current;

        if (!scene || !host) {
            return;
        }

        const rect = host.getBoundingClientRect();
        const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
        scene.zoomAt(event.clientX - rect.left, event.clientY - rect.top, scene.getZoom() * factor);
        onZoomRef.current?.(scene.getZoom());
    }, []);

    const handleZoomIn = () => {
        const scene = sceneRef.current;
        if (!scene) return;
        const currentZoom = scene.getZoom();
        const camera = scene.getCamera();
        scene.setCamera(camera.x, camera.y, currentZoom * 1.25);
        onZoomRef.current?.(scene.getZoom());
    };

    const handleZoomOut = () => {
        const scene = sceneRef.current;
        if (!scene) return;
        const currentZoom = scene.getZoom();
        const camera = scene.getCamera();
        scene.setCamera(camera.x, camera.y, currentZoom / 1.25);
        onZoomRef.current?.(scene.getZoom());
    };

    const handleFitToScreen = () => {
        const scene = sceneRef.current;
        if (!scene) return;
        scene.fitToScreen();
        onZoomRef.current?.(scene.getZoom());
    };

    return (
        <div
            ref={hostRef}
            className="relative h-full w-full overflow-hidden bg-[#11141a]"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
                endPan();
                sceneRef.current?.setHover(null);
                onHoverRef.current(null);
            }}
            onWheel={handleWheel}
            onContextMenu={(event) => event.preventDefault()}
        >
            {status === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                    Cargando graficos...
                </div>
            )}
            {status === "error" && (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-400">
                    No se pudo inicializar el editor: {errorMessage}
                </div>
            )}

            {/* Controles de zoom abajo a la derecha de la vista previa */}
            <div
                className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 p-1.5 shadow-xl backdrop-blur-sm text-xs text-slate-200 select-none z-10"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={handleZoomOut}
                    className="flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-800 font-bold text-slate-200 hover:bg-slate-700 active:bg-slate-600 transition-colors"
                    title="Alejar zoom (-)"
                >
                    −
                </button>

                <button
                    type="button"
                    onClick={handleZoomIn}
                    className="flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-800 font-bold text-slate-200 hover:bg-slate-700 active:bg-slate-600 transition-colors"
                    title="Acercar zoom (+)"
                >
                    +
                </button>

                <div className="h-4 w-px bg-slate-800 mx-0.5" />

                <button
                    type="button"
                    onClick={handleFitToScreen}
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-[11px] text-slate-300 hover:bg-slate-700 transition-colors"
                    title="Ajustar mapa en pantalla"
                >
                    {model.width}x{model.height} · {TILE_SIZE}px
                </button>
            </div>
        </div>
    );
}
