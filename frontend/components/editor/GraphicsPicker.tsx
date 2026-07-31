"use client";

import { useMemo, useState } from "react";
import type { EditorMapModel, LayerIndex } from "./model/EditorMapModel";

type Props = {
    model: EditorMapModel;
    layer: LayerIndex;
    value: number | null;
    onChange: (grhId: number | null) => void;
};

/**
 * Selector de Grh para pintar. En M2 la fuente son los graficos ya usados en
 * este mapa (`model.usedGraphics()`) mas un id manual: un browser completo de
 * la base de graficos queda para M3.
 */
export function GraphicsPicker({ model, layer, value, onChange }: Props) {
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
                <div className="text-xs text-slate-400">
                    Pincel: <span className="font-mono text-slate-200">{value}</span>{" "}
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
                    <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                        {used.map((grhId) => (
                            <button
                                key={grhId}
                                type="button"
                                className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${
                                    value === grhId
                                        ? "border-sky-400 bg-sky-950 text-sky-200"
                                        : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                                }`}
                                onClick={() => onChange(grhId)}
                            >
                                {grhId}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
