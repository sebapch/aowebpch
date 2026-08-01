"use client";

import type { GraphicsDB } from "../../types/game";
import { getTexturePath } from "../../utils/gameLoader";

/**
 * Resuelve un grh animado a su primer frame estatico (recursivo por si el
 * frame 1 tambien es animado). Devuelve null si el id no existe en la DB.
 */
export function resolveStaticGraphicId(grhId: number, graphicsDB: GraphicsDB): number | null {
    const data = graphicsDB[String(grhId)];
    if (!data) return null;
    if (data.numFrames > 1) {
        const firstFrame = Number(data.frames?.["1"]);
        if (Number.isFinite(firstFrame) && firstFrame > 0 && firstFrame !== grhId) {
            return resolveStaticGraphicId(firstFrame, graphicsDB);
        }
        return null;
    }
    return grhId;
}

/**
 * Miniatura recortada de un spritesheet (`/graphics/{numFile}.png`) via
 * `background-position`, escalada a `size`px. Mismo patron que
 * `GraphicsPicker`/`GraphicsCatalogModal`/`InventoryFloatingPanel`.
 */
export function GraphicThumbnail({
    grhId,
    graphicsDB,
    size = 28,
}: {
    grhId: number;
    graphicsDB: GraphicsDB | null;
    size?: number;
}) {
    const resolved = graphicsDB ? resolveStaticGraphicId(grhId, graphicsDB) : null;
    const data = resolved !== null ? (graphicsDB?.[String(resolved)] ?? null) : null;

    if (!data?.numFile) {
        return (
            <div
                style={{ width: size, height: size }}
                className="shrink-0 rounded bg-slate-800 border border-slate-800"
            />
        );
    }

    const scale = Math.min(1, (size - 2) / Math.max(data.width, data.height, 1));

    return (
        <div
            className="relative shrink-0 overflow-hidden rounded bg-black/40 border border-slate-800"
            style={{ width: size, height: size }}
        >
            <div
                className="absolute left-1/2 top-1/2 bg-no-repeat"
                style={{
                    width: data.width,
                    height: data.height,
                    backgroundImage: `url(${getTexturePath(data)})`,
                    backgroundPosition: `-${data.sX}px -${data.sY}px`,
                    transform: `translate(-50%, -50%) scale(${scale})`,
                    transformOrigin: "center",
                }}
            />
        </div>
    );
}
