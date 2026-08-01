/**
 * Categorias de items para el editor, inferidas de los datos reales de
 * `objs.json` (no del enum `OBJECT_TYPE` de `aowProtocol.ts`, que solo nombra
 * 13 de los ~27 `objType` en uso y con etiquetas pensadas para el calculo de
 * stats de equipo, no para exhibir un catalogo). Puramente de UI: no cambia
 * el `objType` real de ningun item ni afecta logica de juego.
 */

export type ItemCategory = {
    objType: number;
    key: string;
    label: string;
};

export const ITEM_CATEGORIES: ItemCategory[] = [
    { objType: 1, key: "comida", label: "Comida" },
    { objType: 2, key: "armas", label: "Armas" },
    { objType: 3, key: "armaduras", label: "Armaduras" },
    { objType: 4, key: "arboles", label: "Arboles" },
    { objType: 5, key: "oro", label: "Oro" },
    { objType: 6, key: "puertas", label: "Puertas" },
    { objType: 7, key: "contenedores", label: "Contenedores" },
    { objType: 8, key: "carteles", label: "Carteles y decoracion" },
    { objType: 9, key: "llaves", label: "Llaves" },
    { objType: 10, key: "foros", label: "Foros" },
    { objType: 11, key: "pociones", label: "Pociones" },
    { objType: 12, key: "libros", label: "Libros" },
    { objType: 13, key: "bebidas", label: "Bebidas" },
    { objType: 14, key: "materiales", label: "Materiales (lena/pieles)" },
    { objType: 15, key: "fogatas", label: "Fogatas" },
    { objType: 16, key: "escudos", label: "Escudos" },
    { objType: 17, key: "cascos", label: "Cascos" },
    { objType: 18, key: "accesoriosMagicos", label: "Accesorios magicos" },
    { objType: 19, key: "teleports", label: "Teleports" },
    { objType: 20, key: "mobiliario", label: "Mobiliario" },
    { objType: 21, key: "decorativos", label: "Objetos decorativos" },
    { objType: 22, key: "yacimientos", label: "Yacimientos" },
    { objType: 23, key: "minerales", label: "Minerales" },
    { objType: 24, key: "magicosConsumibles", label: "Objetos magicos consumibles" },
    { objType: 26, key: "cuernos", label: "Cuernos de llamado" },
    { objType: 27, key: "yunques", label: "Yunques" },
    { objType: 28, key: "fraguas", label: "Fraguas" },
    { objType: 29, key: "gemas", label: "Gemas" },
    { objType: 30, key: "pielesYFlores", label: "Pieles y flores" },
    { objType: 31, key: "embarcaciones", label: "Embarcaciones" },
    { objType: 32, key: "flechas", label: "Flechas" },
    { objType: 33, key: "odres", label: "Odres" },
    { objType: 34, key: "odres", label: "Odres" },
    { objType: 35, key: "misceláneo", label: "Misceláneo (sangre/rejas)" },
    { objType: 36, key: "lingotes", label: "Lingotes" },
    { objType: 37, key: "mochilas", label: "Mochilas" },
];

const LABEL_BY_OBJ_TYPE = new Map(ITEM_CATEGORIES.map((category) => [category.objType, category.label]));

export function getItemCategoryLabel(objType: number): string {
    return LABEL_BY_OBJ_TYPE.get(objType) ?? `Otros (tipo ${objType})`;
}

/**
 * Ids de clase que aparecen en `clasesNoPermitidas`. Solo 8 son clases
 * jugables hoy (ver `CLASS_ID_MAP` en `frontend/lib/characterCreation.ts`);
 * el resto son ids legado del Argentum original que siguen apareciendo en
 * datos existentes.
 */
export const CLASS_LABEL_BY_ID: Record<number, string> = {
    1: "Mago",
    2: "Clerigo",
    3: "Guerrero",
    4: "Asesino",
    6: "Bardo",
    7: "Druida",
    8: "Paladin",
    9: "Cazador",
};

export function getClassLabel(classId: number): string {
    return CLASS_LABEL_BY_ID[classId] ?? `Clase #${classId}`;
}
