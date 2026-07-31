"use client";

import { useMemo, useState } from "react";
import type { GraphicData, GraphicsDB } from "../../types/game";
import { getTexturePath } from "../../utils/gameLoader";
import type { EditorMapModel, LayerIndex } from "./model/EditorMapModel";

type Props = {
    model: EditorMapModel;
    layer: LayerIndex;
    value: number | null;
    onChange: (grhId: number | null) => void;
    graphicsDB: GraphicsDB | null;
};

const THUMB_SIZE = 28;

/** Resuelve un grh animado a su primer frame, igual que EditorTextureCache. */
function resolveStaticGraphicId(grhId: number, graphicsDB: GraphicsDB): number | null {
    const data = graphicsDB[String(grhId)];

    if (!data) {
        return null;
    }

    if (data.numFrames > 1) {
        const firstFrame = Number(data.frames?.["1"]);

        if (Number.isFinite(firstFrame) && firstFrame > 0 && firstFrame !== grhId) {
            return resolveStaticGraphicId(firstFrame, graphicsDB);
        }

        return null;
    }

    return grhId;
}

function resolveThumbnailData(grhId: number, graphicsDB: GraphicsDB | null): GraphicData | null {
    if (!graphicsDB) {
        return null;
    }

    const resolved = resolveStaticGraphicId(grhId, graphicsDB);
    return resolved !== null ? (graphicsDB[String(resolved)] ?? null) : null;
}

function GraphicThumbnail({ grhId, graphicsDB, size = THUMB_SIZE }: { grhId: number; graphicsDB: GraphicsDB | null; size?: number }) {
    const data = resolveThumbnailData(grhId, graphicsDB);

    if (!data?.numFile) {
        return <div style={{ width: size, height: size }} className="shrink-0 rounded bg-slate-800" />;
    }

    const scale = Math.min(1, (size - 2) / Math.max(data.width, data.height, 1));

    return (
        <div
            className="relative shrink-0 overflow-hidden rounded bg-black/30"
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

/**
 * Selector de Grh para pintar. En M2 la fuente son los graficos ya usados en
 * este mapa (`model.usedGraphics()`) mas un id manual: un browser completo de
 * la base de graficos queda para M3.
 */
export function GraphicsPicker({ model, layer, value, onChange, graphicsDB }: Props) {
    const [manualInput, setManualInput] = useState("");
    const used = useMemo(
        () => [...model.usedGraphics().byLayer[layer]].sort((a, b) => a - b),
        [model, layer],
    );

    const applyManualInput = () => {
        const parsed = Number.parseInt(manualInput, 10);
        if (Number.isInteger(parsed) && parsed > 0) {
            onChange(parsed);
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1">
                <input
                    type="number"
                    min={1}
                    placeholder="Grh id"
                    className="w-20 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs"
                    value={manualInput}
                    onChange={(event) => setManualInput(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            applyManualInput();
                        }
                    }}
                />
                <button
                    type="button"
                    className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
                    onClick={applyManualInput}
                >
                    Usar
                </button>
            </div>

            {value !== null && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <GraphicThumbnail grhId={value} graphicsDB={graphicsDB} size={22} />
                    Pincel: <span className="font-mono text-slate-200">{value}</span>
                    <button
                        type="button"
                        className="text-slate-500 underline hover:text-slate-300"
                        onClick={() => onChange(null)}
                    >
                        limpiar
                    </button>
                </div>
            )}

            {used.length > 0 && (
                <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-600">Usados en esta capa</p>
                    <div className="grid max-h-40 grid-cols-5 gap-1 overflow-y-auto">
                        {used.map((grhId) => (
                            <button
                                key={grhId}
                                type="button"
                                title={`Grh ${grhId}`}
                                className={`flex items-center justify-center rounded border p-0.5 ${
                                    value === grhId
                                        ? "border-sky-400 bg-sky-950"
                                        : "border-slate-700 bg-slate-800 hover:bg-slate-700"
                                }`}
                                onClick={() => onChange(grhId)}
                            >
                                <GraphicThumbnail grhId={grhId} graphicsDB={graphicsDB} />
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
