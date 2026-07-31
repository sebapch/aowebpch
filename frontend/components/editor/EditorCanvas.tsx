"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import { loadGraphicsDB } from "../../utils/gameLoader";
import { TILE_SIZE } from "../../lib/viewport";
import type { EditorMapModel, LayerIndex } from "./model/EditorMapModel";
import { EditorScene, type LayerVisibility, type OverlayFlags } from "./render/EditorScene";
import { EditorTextureCache } from "./render/editorTextures";

export type EditorCanvasHandle = {
    fitToScreen: () => void;
    markAllDirty: () => void;
};

type Props = {
    model: EditorMapModel;
    layerVisibility: LayerVisibility;
    layerAlpha: Record<LayerIndex, number>;
    overlays: OverlayFlags;
    onHoverTile: (tile: { x: number; y: number } | null) => void;
    onPickTile: (tile: { x: number; y: number }) => void;
    onReady?: (handle: EditorCanvasHandle) => void;
    onZoomChange?: (zoom: number) => void;
};

export function EditorCanvas({
    model,
    layerVisibility,
    layerAlpha,
    overlays,
    onHoverTile,
    onPickTile,
    onReady,
    onZoomChange,
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

    useEffect(() => {
        onHoverRef.current = onHoverTile;
        onPickRef.current = onPickTile;
        onZoomRef.current = onZoomChange;
    }, [onHoverTile, onPickTile, onZoomChange]);

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

                const graphicsDB = await loadGraphicsDB();

                if (cancelled) {
                    app.destroy(true, { children: true });
                    return;
                }

                host.appendChild(app.canvas);
                app.canvas.style.width = "100%";
                app.canvas.style.height = "100%";
                app.canvas.style.display = "block";

                const textures = new EditorTextureCache(graphicsDB);
                const scene = new EditorScene(app, textures, model);
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

    const toLocal = useCallback((event: React.PointerEvent | React.MouseEvent) => {
        const host = hostRef.current;

        if (!host) {
            return { x: 0, y: 0 };
        }

        const rect = host.getBoundingClientRect();

        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }, []);

    const handlePointerDown = useCallback(
        (event: React.PointerEvent) => {
            const scene = sceneRef.current;

            if (!scene) {
                return;
            }

            // Boton del medio o secundario: desplazar. Principal: seleccionar.
            if (event.button === 1 || event.button === 2) {
                panState.current = { active: true, lastX: event.clientX, lastY: event.clientY };
                (event.target as Element).setPointerCapture?.(event.pointerId);
                event.preventDefault();
                return;
            }

            if (event.button === 0) {
                const local = toLocal(event);
                const tile = scene.screenToTile(local.x, local.y);

                if (tile) {
                    onPickRef.current(tile);
                }
            }
        },
        [toLocal],
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

            const local = toLocal(event);
            const tile = scene.screenToTile(local.x, local.y);
            scene.setHover(tile);
            onHoverRef.current(tile);
        },
        [toLocal],
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

    return (
        <div
            ref={hostRef}
            className="relative h-full w-full overflow-hidden bg-[#11141a]"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPan}
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
            <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-[11px] text-slate-300">
                {model.width}x{model.height} · {TILE_SIZE}px/tile
            </div>
        </div>
    );
}
