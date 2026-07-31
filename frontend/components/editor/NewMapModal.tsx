"use client";

import { useState } from "react";
import { EditorApiError, type CreateMapInput } from "../../lib/editor/api";
import { TERRENO_OPTIONS, ZONA_OPTIONS } from "../../lib/editor/types";

/**
 * Crea un mapa vacio. El id lo asigna el servidor con el primer libre del rango
 * seguro (289-499), asi que aca solo se piden nombre, tamano y terreno/zona.
 */
export function NewMapModal({
    isOpen,
    onClose,
    onCreate,
}: {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (input: CreateMapInput) => Promise<void>;
}) {
    const [name, setName] = useState("");
    const [width, setWidth] = useState(100);
    const [height, setHeight] = useState(100);
    const [terreno, setTerreno] = useState<string>(TERRENO_OPTIONS[0]);
    const [zona, setZona] = useState<string>("CAMPO");
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) {
        return null;
    }

    const submit = async () => {
        setCreating(true);
        setError(null);

        try {
            await onCreate({ name: name.trim(), width, height, terreno, zona });
        } catch (err) {
            setError(err instanceof EditorApiError ? err.message : "No se pudo crear el mapa.");
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
                onClick={(event) => event.stopPropagation()}
            >
                <header className="border-b border-slate-800 px-4 py-3">
                    <h2 className="text-sm font-semibold text-slate-100">Nuevo mapa</h2>
                    <p className="text-[11px] text-slate-500">
                        Se crea vacio y el servidor le asigna el primer id libre.
                    </p>
                </header>

                <div className="space-y-3 px-4 py-3 text-sm">
                    <label className="block">
                        <span className="block text-[11px] uppercase tracking-wide text-slate-500">Nombre</span>
                        <input
                            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1"
                            placeholder="Bosque del norte"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                            <span className="block text-[11px] uppercase tracking-wide text-slate-500">Ancho</span>
                            <input
                                type="number"
                                min={1}
                                max={500}
                                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1"
                                value={width}
                                onChange={(event) => setWidth(Number(event.target.value))}
                            />
                        </label>
                        <label className="block">
                            <span className="block text-[11px] uppercase tracking-wide text-slate-500">Alto</span>
                            <input
                                type="number"
                                min={1}
                                max={500}
                                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1"
                                value={height}
                                onChange={(event) => setHeight(Number(event.target.value))}
                            />
                        </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                            <span className="block text-[11px] uppercase tracking-wide text-slate-500">Terreno</span>
                            <select
                                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1"
                                value={terreno}
                                onChange={(event) => setTerreno(event.target.value)}
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
                                value={zona}
                                onChange={(event) => setZona(event.target.value)}
                            >
                                {ZONA_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {error && <p className="text-xs text-red-300">{error}</p>}
                </div>

                <footer className="flex justify-end gap-2 border-t border-slate-800 px-4 py-3">
                    <button
                        type="button"
                        className="rounded border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800"
                        onClick={onClose}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        disabled={creating}
                        className="rounded bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => void submit()}
                    >
                        {creating ? "Creando..." : "Crear mapa"}
                    </button>
                </footer>
            </div>
        </div>
    );
}
