"use client";

import { useEffect, useState } from "react";
import { searchItemTemplates } from "../../lib/editor/api";
import type { ItemTemplateSummary } from "../../lib/editor/types";

/**
 * Buscador de plantillas de objeto con debounce, compartido por el inspector de
 * tiles (para colocar un objeto en el mapa) y por las listas de drop/venta del
 * panel de NPC.
 */
export function ItemSearchField({
    placeholder = "Buscar item por nombre o id...",
    onSelect,
}: {
    placeholder?: string;
    onSelect: (item: ItemTemplateSummary) => void;
}) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<ItemTemplateSummary[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        let cancelled = false;
        setSearching(true);

        const timeout = setTimeout(() => {
            void searchItemTemplates(query.trim())
                .then((items) => {
                    if (!cancelled) {
                        setResults(items);
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        setResults([]);
                    }
                })
                .finally(() => {
                    if (!cancelled) {
                        setSearching(false);
                    }
                });
        }, 250);

        return () => {
            cancelled = true;
            clearTimeout(timeout);
        };
    }, [query]);

    return (
        <div className="relative">
            <input
                className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs"
                placeholder={placeholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
            />
            {query.trim() && (
                <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded border border-slate-700 bg-slate-900 shadow-lg">
                    {searching && <p className="px-2 py-1 text-[11px] text-slate-500">Buscando...</p>}
                    {!searching && results.length === 0 && (
                        <p className="px-2 py-1 text-[11px] text-slate-500">Sin resultados.</p>
                    )}
                    {results.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className="block w-full px-2 py-1 text-left text-xs hover:bg-slate-800"
                            onClick={() => {
                                onSelect(item);
                                setQuery("");
                                setResults([]);
                            }}
                        >
                            #{item.id} · {item.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Resuelve nombres de items por id, cacheando lo ya resuelto. La api solo expone
 * busqueda por texto, asi que buscamos el id y filtramos la coincidencia exacta.
 */
export function useItemNames(ids: number[]): Record<number, string> {
    const [itemNames, setItemNames] = useState<Record<number, string>>({});
    const key = ids.join(",");

    useEffect(() => {
        const missingIds = [...new Set(ids)].filter((id) => !(id in itemNames));

        if (missingIds.length === 0) {
            return;
        }

        let cancelled = false;

        void Promise.all(
            missingIds.map((id) =>
                searchItemTemplates(String(id))
                    .then((found) => found.find((item) => item.id === id))
                    .catch(() => undefined),
            ),
        ).then((found) => {
            if (cancelled) {
                return;
            }

            setItemNames((current) => {
                const next = { ...current };

                for (const item of found) {
                    if (item) {
                        next[item.id] = item.name;
                    }
                }

                return next;
            });
        });

        return () => {
            cancelled = true;
        };
        // `key` estabiliza la lista de ids sin re-disparar por identidad del array.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return itemNames;
}
