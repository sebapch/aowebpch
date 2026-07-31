"use client";

import {
    RESTRINGIR_OPTIONS,
    TERRENO_OPTIONS,
    ZONA_OPTIONS,
    type MapMetadata,
} from "../../lib/editor/types";

/**
 * Editor de `meta.json`. Los cambios viajan dentro del bundle en el guardado
 * normal; el servidor solo reescribe el archivo si algo cambio de verdad.
 */
export function MapMetaPanel({
    meta,
    onChange,
    onClose,
}: {
    meta: MapMetadata;
    onChange: (meta: MapMetadata) => void;
    onClose: () => void;
}) {
    const update = <K extends keyof MapMetadata>(key: K, value: MapMetadata[K]) => {
        onChange({ ...meta, [key]: value });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
                onClick={(event) => event.stopPropagation()}
            >
                <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                    <div>
                        <h2 className="text-sm font-semibold text-slate-100">Propiedades del mapa {meta.id}</h2>
                        <p className="text-[11px] text-slate-500">
                            Se guardan con Ctrl+S junto con el resto del mapa.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        onClick={onClose}
                    >
                        Cerrar
                    </button>
                </header>

                <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
                    <label className="block">
                        <span className="block text-[11px] uppercase tracking-wide text-slate-500">Nombre</span>
                        <input
                            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1"
                            value={meta.name}
                            onChange={(event) => update("name", event.target.value)}
                        />
                    </label>

                    <div className="grid grid-cols-3 gap-2">
                        <label className="block">
                            <span className="block text-[11px] uppercase tracking-wide text-slate-500">Terreno</span>
                            <select
                                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1"
                                value={meta.terreno}
                                onChange={(event) => update("terreno", event.target.value)}
                            >
                                {TERRENO_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="block text-[11px] uppercase tracking-wide text-slate-500">Zona</span>
                            <select
                                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1"
                                value={meta.zona}
                                onChange={(event) => update("zona", event.target.value)}
                            >
                                {ZONA_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="block text-[11px] uppercase tracking-wide text-slate-500">Restringir</span>
                            <select
                                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1"
                                value={String(meta.restringir)}
                                onChange={(event) => update("restringir", event.target.value)}
                            >
                                {RESTRINGIR_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {option === "" ? "(vacio)" : option}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <label className="block">
                            <span className="block text-[11px] uppercase tracking-wide text-slate-500">Musica</span>
                            <input
                                type="number"
                                min={0}
                                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1"
                                value={meta.musicNum}
                                onChange={(event) => update("musicNum", Number(event.target.value))}
                            />
                        </label>

                        <label className="block">
                            <span className="block text-[11px] uppercase tracking-wide text-slate-500">Nivel min.</span>
                            <input
                                type="number"
                                min={0}
                                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1"
                                value={meta.minLevel ?? 0}
                                onChange={(event) => update("minLevel", Number(event.target.value))}
                            />
                        </label>

                        <label className="block">
                            <span className="block text-[11px] uppercase tracking-wide text-slate-500">Nivel max.</span>
                            <input
                                type="number"
                                min={0}
                                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1"
                                value={meta.maxLevel ?? 0}
                                onChange={(event) => update("maxLevel", Number(event.target.value))}
                            />
                        </label>
                    </div>

                    <div className="space-y-2 border-t border-slate-800 pt-3">
                        <label className="flex items-center gap-2 text-xs text-slate-300">
                            <input
                                type="checkbox"
                                checked={meta.pk === 1}
                                onChange={(event) => update("pk", event.target.checked ? 1 : 0)}
                            />
                            Zona segura (pk = 1)
                        </label>

                        <label className="flex items-center gap-2 text-xs text-slate-300">
                            <input
                                type="checkbox"
                                checked={meta.magiaSinEfecto === 1}
                                onChange={(event) => update("magiaSinEfecto", event.target.checked ? 1 : 0)}
                            />
                            Magia sin efecto
                        </label>

                        <label className="flex items-center gap-2 text-xs text-slate-300">
                            <input
                                type="checkbox"
                                checked={meta.noEncriptarMp === 1}
                                onChange={(event) => update("noEncriptarMp", event.target.checked ? 1 : 0)}
                            />
                            No encriptar MP
                        </label>

                        <label className="flex items-center gap-2 text-xs text-slate-300">
                            <input
                                type="checkbox"
                                checked={meta.backup === 1}
                                onChange={(event) => update("backup", event.target.checked ? 1 : 0)}
                            />
                            Backup
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}
