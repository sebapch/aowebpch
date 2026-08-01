"use client";

import { useCallback, useEffect, useState } from "react";
import { EditorApiError, fetchItemList, fetchItemTemplate, saveItemTemplate } from "../../lib/editor/api";
import type { ItemListResult } from "../../lib/editor/api";
import type { DataObj, GameObjectRecord } from "../../lib/editor/types";
import { CLASS_LABEL_BY_ID, getClassLabel, getItemCategoryLabel, ITEM_CATEGORIES } from "../../lib/editor/itemCategories";
import { GraphicThumbnail } from "./GraphicThumbnail";
import type { GraphicsDB } from "../../types/game";
import { loadGraphicsDB } from "../../utils/gameLoader";

type Props = {
    onClose: () => void;
};

type EditableFields = {
    name: string;
    objType: number;
    valor: number;
    grhIndex: number;
    anim: number;
    minHit: number;
    maxHit: number;
    minDef: number;
    maxDef: number;
    minDefMag: number;
    maxDefMag: number;
    resistenciaMagica: number;
    magicDamageBonus: number;
    magicPenetration: number;
    staffDamageBonus: number;
    tipoPocion: number;
    minModificador: number;
    maxModificador: number;
    newbie: number;
    razaEnana: number;
    noSeCae: number;
    agarrable: number;
    proyectil: number;
    cerrada: number;
    llave: number;
    indexAbierta: number;
    indexCerrada: number;
    spellIndex: number;
    apu: number;
    porcentaje: number;
    abriga: number;
};

function toEditable(data: DataObj): EditableFields {
    return {
        name: data.name ?? "",
        objType: data.objType ?? 0,
        valor: data.valor ?? 0,
        grhIndex: data.grhIndex ?? 0,
        anim: data.anim ?? 0,
        minHit: data.minHit ?? 0,
        maxHit: data.maxHit ?? 0,
        minDef: data.minDef ?? 0,
        maxDef: data.maxDef ?? 0,
        minDefMag: data.minDefMag ?? 0,
        maxDefMag: data.maxDefMag ?? 0,
        resistenciaMagica: data.resistenciaMagica ?? 0,
        magicDamageBonus: data.magicDamageBonus ?? 0,
        magicPenetration: data.magicPenetration ?? 0,
        staffDamageBonus: data.staffDamageBonus ?? 0,
        tipoPocion: data.tipoPocion ?? 0,
        minModificador: data.minModificador ?? 0,
        maxModificador: data.maxModificador ?? 0,
        newbie: data.newbie ?? 0,
        razaEnana: data.razaEnana ?? 0,
        noSeCae: data.noSeCae ?? 0,
        agarrable: data.agarrable ?? 0,
        proyectil: data.proyectil ?? 0,
        cerrada: data.cerrada ?? 0,
        llave: data.llave ?? 0,
        indexAbierta: data.indexAbierta ?? 0,
        indexCerrada: data.indexCerrada ?? 0,
        spellIndex: data.spellIndex ?? 0,
        apu: data.apu ?? 0,
        porcentaje: data.porcentaje ?? 0,
        abriga: data.abriga ?? 0,
    };
}

type FieldSpec = { key: keyof EditableFields; label: string };

const BASIC_FIELDS: FieldSpec[] = [
    { key: "valor", label: "Valor" },
    { key: "grhIndex", label: "Grafico (grhIndex)" },
    { key: "anim", label: "Animacion" },
];

const COMBAT_FIELDS: FieldSpec[] = [
    { key: "minHit", label: "Golpe minimo" },
    { key: "maxHit", label: "Golpe maximo" },
    { key: "minDef", label: "Defensa minima" },
    { key: "maxDef", label: "Defensa maxima" },
    { key: "minDefMag", label: "Def. magica minima" },
    { key: "maxDefMag", label: "Def. magica maxima" },
    { key: "resistenciaMagica", label: "Resistencia magica" },
    { key: "magicDamageBonus", label: "Bonus daño magico" },
    { key: "magicPenetration", label: "Penetracion magica" },
    { key: "staffDamageBonus", label: "Bonus daño (baston)" },
];

const POTION_FIELDS: FieldSpec[] = [
    { key: "tipoPocion", label: "Tipo de pocion" },
    { key: "minModificador", label: "Modificador minimo" },
    { key: "maxModificador", label: "Modificador maximo" },
];

const CONTAINER_FIELDS: FieldSpec[] = [
    { key: "cerrada", label: "Cerrada" },
    { key: "llave", label: "Llave (id)" },
    { key: "indexAbierta", label: "Grafico abierta" },
    { key: "indexCerrada", label: "Grafico cerrada" },
];

const OTHER_FIELDS: FieldSpec[] = [
    { key: "spellIndex", label: "Hechizo (spellIndex)" },
    { key: "apu", label: "Apu" },
    { key: "porcentaje", label: "Porcentaje" },
    { key: "abriga", label: "Abriga" },
];

const RESTRICTION_TOGGLES: FieldSpec[] = [
    { key: "newbie", label: "Newbie" },
    { key: "razaEnana", label: "Raza enana" },
    { key: "noSeCae", label: "No se cae" },
    { key: "agarrable", label: "Agarrable" },
    { key: "proyectil", label: "Proyectil" },
];

function FieldGrid({
    fields,
    values,
    onChange,
}: {
    fields: FieldSpec[];
    values: EditableFields;
    onChange: <K extends keyof EditableFields>(key: K, value: EditableFields[K]) => void;
}) {
    return (
        <div className="grid grid-cols-3 gap-2">
            {fields.map(({ key, label }) => (
                <div key={key}>
                    <label className="block text-[11px] uppercase tracking-wide text-slate-500">{label}</label>
                    <input
                        type="number"
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
                        value={values[key]}
                        onChange={(event) => onChange(key, Number(event.target.value))}
                    />
                </div>
            ))}
        </div>
    );
}

function Fieldset({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <fieldset className="rounded border border-slate-800 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</legend>
            <div className="mt-1">{children}</div>
        </fieldset>
    );
}

/**
 * Panel modal con el catalogo completo de items (`game_objects`): lista
 * filtrable por categoria/busqueda a la izquierda, formulario dividido por
 * secciones a la derecha. No depende del mapa cargado.
 */
export function ItemsPanel({ onClose }: Props) {
    const [graphicsDB, setGraphicsDB] = useState<GraphicsDB | null>(null);

    useEffect(() => {
        void loadGraphicsDB()
            .then(setGraphicsDB)
            .catch((err) => console.error("Error al cargar base de datos de graficos:", err));
    }, []);

    const [search, setSearch] = useState("");
    const [objTypeFilter, setObjTypeFilter] = useState<number | "">("");
    const [page, setPage] = useState(1);
    const [listResult, setListResult] = useState<ItemListResult | null>(null);
    const [listLoading, setListLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);

    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [record, setRecord] = useState<GameObjectRecord | null>(null);
    const [fields, setFields] = useState<EditableFields | null>(null);
    const [classesNoPermitidas, setClassesNoPermitidas] = useState<number[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        setListLoading(true);
        setListError(null);

        const timeout = setTimeout(() => {
            void fetchItemList({
                search: search.trim() || undefined,
                objType: objTypeFilter === "" ? undefined : objTypeFilter,
                page,
                limit: 50,
            })
                .then((result) => {
                    if (!cancelled) {
                        setListResult(result);
                    }
                })
                .catch((err: unknown) => {
                    if (!cancelled) {
                        setListError(err instanceof EditorApiError ? err.message : "No se pudo cargar la lista de items.");
                    }
                })
                .finally(() => {
                    if (!cancelled) {
                        setListLoading(false);
                    }
                });
        }, 250);

        return () => {
            cancelled = true;
            clearTimeout(timeout);
        };
    }, [search, objTypeFilter, page]);

    useEffect(() => {
        setPage(1);
    }, [search, objTypeFilter]);

    useEffect(() => {
        if (selectedId === null) {
            return;
        }

        let cancelled = false;
        setDetailLoading(true);
        setDetailError(null);
        setSaveError(null);
        setSavedAt(null);

        void fetchItemTemplate(selectedId)
            .then((item) => {
                if (cancelled) {
                    return;
                }

                setRecord(item);
                setFields(toEditable(item.data));
                setClassesNoPermitidas(item.data.clasesNoPermitidas ?? []);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setDetailError(err instanceof EditorApiError ? err.message : `No se pudo cargar el item ${selectedId}.`);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setDetailLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [selectedId]);

    const updateField = useCallback(<K extends keyof EditableFields>(key: K, value: EditableFields[K]) => {
        setFields((current) => (current ? { ...current, [key]: value } : current));
    }, []);

    const toggleClass = useCallback((classId: number) => {
        setClassesNoPermitidas((current) =>
            current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId].sort((a, b) => a - b),
        );
    }, []);

    const handleSave = useCallback(async () => {
        if (!record || !fields || selectedId === null) {
            return;
        }

        setSaving(true);
        setSaveError(null);

        const nextData: DataObj = {
            ...record.data,
            ...fields,
            clasesNoPermitidas: classesNoPermitidas,
        };

        try {
            const saved = await saveItemTemplate(selectedId, nextData);
            setRecord(saved);
            setFields(toEditable(saved.data));
            setClassesNoPermitidas(saved.data.clasesNoPermitidas ?? []);
            setSavedAt(Date.now());
            setListResult((current) =>
                current
                    ? {
                          ...current,
                          objects: current.objects.map((item) =>
                              item.id === saved.id ? { ...item, name: saved.name, objType: saved.objType } : item,
                          ),
                      }
                    : current,
            );
        } catch (err) {
            setSaveError(err instanceof EditorApiError ? err.message : "No se pudo guardar el item.");
        } finally {
            setSaving(false);
        }
    }, [record, fields, classesNoPermitidas, selectedId]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="flex h-[85vh] w-full max-w-5xl overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex w-80 flex-none flex-col border-r border-slate-800">
                    <header className="border-b border-slate-800 px-3 py-3">
                        <h2 className="text-sm font-semibold text-slate-100">Catalogo de items</h2>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                            Plantilla compartida: los cambios afectan a todas las apariciones del item.
                        </p>
                        <input
                            className="mt-2 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs"
                            placeholder="Buscar por nombre o id..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                        <select
                            className="mt-2 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs"
                            value={objTypeFilter}
                            onChange={(event) =>
                                setObjTypeFilter(event.target.value === "" ? "" : Number(event.target.value))
                            }
                        >
                            <option value="">Todas las categorias</option>
                            {ITEM_CATEGORIES.map((category) => (
                                <option key={category.objType} value={category.objType}>
                                    {category.label}
                                </option>
                            ))}
                        </select>
                    </header>

                    <div className="flex-1 overflow-y-auto">
                        {listLoading && <p className="px-3 py-2 text-[11px] text-slate-500">Cargando...</p>}
                        {listError && <p className="px-3 py-2 text-xs text-red-400">{listError}</p>}
                        {!listLoading && !listError && listResult?.objects.length === 0 && (
                            <p className="px-3 py-2 text-[11px] text-slate-600">Sin resultados.</p>
                        )}
                        {listResult?.objects.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelectedId(item.id)}
                                className={`flex w-full items-center gap-2 border-b border-slate-800/60 px-3 py-2 text-left text-xs hover:bg-slate-800 ${
                                    selectedId === item.id ? "bg-slate-800" : ""
                                }`}
                            >
                                <GraphicThumbnail grhId={item.grhIndex} graphicsDB={graphicsDB} size={28} />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate">
                                        #{item.id} · {item.name}
                                    </div>
                                    <div className="text-[10px] text-slate-500">{getItemCategoryLabel(item.objType)}</div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {listResult && listResult.pagination.totalPages > 1 && (
                        <footer className="flex items-center justify-between border-t border-slate-800 px-3 py-2 text-[11px] text-slate-400">
                            <button
                                type="button"
                                disabled={page <= 1}
                                onClick={() => setPage((current) => Math.max(1, current - 1))}
                                className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Anterior
                            </button>
                            <span>
                                Pagina {listResult.pagination.page} de {listResult.pagination.totalPages}
                            </span>
                            <button
                                type="button"
                                disabled={page >= listResult.pagination.totalPages}
                                onClick={() => setPage((current) => current + 1)}
                                className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Siguiente
                            </button>
                        </footer>
                    )}
                </div>

                <div className="flex flex-1 flex-col overflow-hidden">
                    <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                        <div className="flex items-center gap-2">
                            {selectedId !== null && fields && (
                                <GraphicThumbnail grhId={fields.grhIndex} graphicsDB={graphicsDB} size={32} />
                            )}
                            <h3 className="text-sm font-semibold text-slate-100">
                                {selectedId === null
                                    ? "Selecciona un item"
                                    : `Item #${selectedId}${fields ? ` · ${fields.name}` : ""}`}
                            </h3>
                        </div>
                        <button
                            type="button"
                            className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                            onClick={onClose}
                        >
                            Cerrar
                        </button>
                    </header>

                    <div className="flex-1 overflow-y-auto px-4 py-3">
                        {selectedId === null && (
                            <p className="text-xs text-slate-500">Elegi un item de la lista para ver y editar sus campos.</p>
                        )}

                        {detailLoading && <p className="text-xs text-slate-500">Cargando...</p>}
                        {detailError && <p className="text-xs text-red-400">{detailError}</p>}

                        {fields && !detailLoading && (
                            <div className="space-y-3">
                                <Fieldset title="Basico">
                                    <div className="space-y-2">
                                        <div>
                                            <label className="block text-[11px] uppercase tracking-wide text-slate-500">
                                                Nombre
                                            </label>
                                            <input
                                                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
                                                value={fields.name}
                                                onChange={(event) => updateField("name", event.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] uppercase tracking-wide text-slate-500">
                                                Categoria
                                            </label>
                                            <select
                                                className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
                                                value={fields.objType}
                                                onChange={(event) => updateField("objType", Number(event.target.value))}
                                            >
                                                {!ITEM_CATEGORIES.some((category) => category.objType === fields.objType) && (
                                                    <option value={fields.objType}>{getItemCategoryLabel(fields.objType)}</option>
                                                )}
                                                {ITEM_CATEGORIES.map((category) => (
                                                    <option key={category.objType} value={category.objType}>
                                                        {category.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <FieldGrid fields={BASIC_FIELDS} values={fields} onChange={updateField} />
                                    </div>
                                </Fieldset>

                                <Fieldset title="Combate">
                                    <FieldGrid fields={COMBAT_FIELDS} values={fields} onChange={updateField} />
                                </Fieldset>

                                <Fieldset title="Pocion">
                                    <FieldGrid fields={POTION_FIELDS} values={fields} onChange={updateField} />
                                </Fieldset>

                                <Fieldset title="Restricciones de uso">
                                    <div className="space-y-2">
                                        <div>
                                            <label className="block text-[11px] uppercase tracking-wide text-slate-500">
                                                Clases que no pueden usarlo
                                            </label>
                                            <div className="mt-1 flex flex-wrap gap-2">
                                                {Object.entries(CLASS_LABEL_BY_ID).map(([id, label]) => {
                                                    const classId = Number(id);
                                                    return (
                                                        <label
                                                            key={classId}
                                                            className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={classesNoPermitidas.includes(classId)}
                                                                onChange={() => toggleClass(classId)}
                                                            />
                                                            {label}
                                                        </label>
                                                    );
                                                })}
                                                {classesNoPermitidas
                                                    .filter((classId) => !(classId in CLASS_LABEL_BY_ID))
                                                    .map((classId) => (
                                                        <label
                                                            key={classId}
                                                            className="flex items-center gap-1 rounded border border-amber-700 bg-amber-950/40 px-2 py-1 text-xs text-amber-300"
                                                            title="Clase legado, no jugable en este servidor"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked
                                                                onChange={() => toggleClass(classId)}
                                                            />
                                                            {getClassLabel(classId)}
                                                        </label>
                                                    ))}
                                            </div>
                                        </div>
                                        <FieldGrid fields={RESTRICTION_TOGGLES} values={fields} onChange={updateField} />
                                    </div>
                                </Fieldset>

                                <Fieldset title="Contenedores / llaves">
                                    <FieldGrid fields={CONTAINER_FIELDS} values={fields} onChange={updateField} />
                                </Fieldset>

                                <Fieldset title="Otros">
                                    <FieldGrid fields={OTHER_FIELDS} values={fields} onChange={updateField} />
                                </Fieldset>
                            </div>
                        )}
                    </div>

                    <footer className="flex items-center gap-3 border-t border-slate-800 px-4 py-3">
                        {saveError && <span className="text-xs text-red-300">{saveError}</span>}
                        {!saveError && savedAt && <span className="text-xs text-emerald-400">Guardado.</span>}
                        <div className="ml-auto flex gap-2">
                            <button
                                type="button"
                                disabled={!fields || saving}
                                className="rounded bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void handleSave()}
                            >
                                {saving ? "Guardando..." : "Guardar"}
                            </button>
                        </div>
                    </footer>
                </div>
            </div>
        </div>
    );
}
