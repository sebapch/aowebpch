/**
 * Espejo de los tipos del formato fuente de mapas (`server/src/mapSource.ts`).
 * El editor trabaja siempre sobre el formato fuente completo, no sobre el
 * formato optimizado con perdida que descarga el juego.
 */

export type LayerGraphics = [number | null, number | null, number | null, number | null];

export type TileExit = { map: number; x: number; y: number };
export type TileExitConfig = TileExit | { destinations: TileExit[] };
export type ObjectInfo = { objIndex: number; amount: number };
export type NpcSpawn = { npcIndex: number; movement?: number };

export type ExpandedTile = {
    graphics: LayerGraphics;
    blocked: boolean;
    exit?: TileExitConfig;
    object?: ObjectInfo;
    /** NPC inline de `specials.npcs` (legado: el cliente del juego lo ignora). */
    npc?: number;
    trigger?: number;
    /** Spawn persistente de `npcs.json`, que es lo que el servidor instancia. */
    spawn?: NpcSpawn;
};

export type ArenaSpawnPoint = { x: number; y: number };

/** Hasta 4 puntos por equipo, reusados para 2v2/3v3/4v4 (se toman los primeros N). */
export type ArenaSpawnConfig = {
    team1: ArenaSpawnPoint[];
    team2: ArenaSpawnPoint[];
};

export const MAX_ARENA_SPAWNS_PER_TEAM = 4;

export type MapMetadata = {
    id: number;
    name: string;
    musicNum: number;
    magiaSinEfecto: number;
    noEncriptarMp: number;
    terreno: string;
    zona: string;
    restringir: string | number;
    /** Ausentes en la mayoria de los mapas; el runtime los lee con `?? 0`. */
    minLevel?: number;
    maxLevel?: number;
    backup: number;
    pk: number;
    /** Habilita el mapa para el veteo de Retos por equipos (2v2/3v3/4v4). */
    isArena?: boolean;
    /** Spawns de equipo para Retos. Ausente/incompleto: el servidor usa el fallback fijo. */
    arenaSpawns?: ArenaSpawnConfig;
    /** Habilita el chat de voz por proximidad en mundo abierto en este mapa. */
    voiceChatEnabled?: boolean;
};

/** `tiles` es row-major: indice `(y-1)*width + (x-1)`. */
export type EditorMapBundle = {
    meta: MapMetadata;
    width: number;
    height: number;
    tiles: ExpandedTile[];
};

/** Una fila de `npcs.json`: el spawn persistente que instancia el servidor. */
export type MapNpcPlacement = {
    mapNum: number;
    x: number;
    y: number;
    npcIndex: number;
    movement?: number;
};

// ---------------------------------------------------------------------------
// Plantillas compartidas de NPCs y objetos (`game_npcs`/`game_objects` en la
// api, no `mapas_source`). Un npcIndex es una sola plantilla reusada por
// todos los spawns que la referencian en cualquier mapa.
// ---------------------------------------------------------------------------

export type NpcDropEntry = { item: number; cant: number };

/** Espejo de `DataNpc` (server/src/npcData.ts): campos conocidos + resto pass-through. */
export type DataNpc = {
    name: string;
    npcType: number;
    idHead: number;
    idBody: number;
    movement: number;
    desc?: string;
    exp?: number;
    gold?: number;
    hp?: number;
    maxHp?: number;
    maxHit?: number;
    minHit?: number;
    def?: number;
    poderAtaque?: number;
    poderEvasion?: number;
    /** Botin al morir. */
    drop?: NpcDropEntry[];
    /** Stock de venta (relevante si npcType es vendedor). */
    objs?: NpcDropEntry[];
    [key: string]: unknown;
};

export type GameNpcRecord = {
    id: number;
    name: string;
    npcType: number;
    isHostile: boolean;
    maxHp: number;
    expReward: number;
    goldReward: number;
    expPerHp: number | null;
    idHead: number;
    idBody: number;
    movement: number;
    version: number;
    updatedAt: string;
    checksum: string;
    data: DataNpc;
};

export type ItemTemplateSummary = {
    id: number;
    name: string;
    objType: number;
    grhIndex: number;
    version: number;
    updatedAt: string;
};

/** Espejo de `OBJECT_DEFAULTS` (`server/src/objectData.ts`): campos conocidos + resto pass-through. */
export type DataObj = {
    name: string;
    objType: number;
    valor: number;
    grhIndex: number;
    tipoPocion?: number;
    minModificador?: number;
    maxModificador?: number;
    anim?: number;
    agarrable?: number;
    minHit?: number;
    maxHit?: number;
    minDef?: number;
    maxDef?: number;
    minDefMag?: number;
    maxDefMag?: number;
    resistenciaMagica?: number;
    magicDamageBonus?: number;
    magicPenetration?: number;
    staffDamageBonus?: number;
    newbie?: number;
    proyectil?: number;
    noSeCae?: number;
    clasesNoPermitidas?: number[];
    indexAbierta?: number;
    indexCerrada?: number;
    llave?: number;
    cerrada?: number;
    spellIndex?: number;
    razaEnana?: number;
    abriga?: number;
    apu?: number;
    porcentaje?: number;
    [key: string]: unknown;
};

export type GameObjectRecord = {
    id: number;
    name: string;
    objType: number;
    version: number;
    updatedAt: string;
    checksum: string;
    data: DataObj;
};

export type MapSummary = {
    id: number;
    name: string;
    width: number;
    height: number;
    terreno: string;
    zona: string;
    pk: number;
    isArena?: boolean;
};

export type EditorHealth = {
    ok: boolean;
    editorEnabled: boolean;
    nodeEnv: string;
    writesAllowed: boolean;
    sinks: {
        source: boolean;
        api: boolean;
        frontendMaps: boolean;
        frontendMapsOptimized: boolean;
    };
};

export const TERRENO_OPTIONS = ["BOSQUE", "NIEVE", "DESIERTO", "LOCAL", "CIUDAD"] as const;
export const ZONA_OPTIONS = ["CIUDAD", "CAMPO", "DUNGEON", "LOCAL"] as const;
export const RESTRINGIR_OPTIONS = ["No", "NEWBIE", "GM", "CAOS", "ARMADA", ""] as const;

/**
 * Semantica conocida de los triggers, leida del codigo del servidor.
 * Los valores 1, 2, 3 y 5 vienen del Argentum original y hoy el servidor no
 * los lee, pero estan presentes en los datos.
 */
export const TRIGGER_LABELS: Record<number, string> = {
    0: "Ninguno",
    1: "1 - bajo techo (legado)",
    2: "2 - invalido (legado)",
    3: "3 - invalido bajo agua (legado)",
    4: "4 - carcel",
    5: "5 - legado",
    6: "6 - zona segura (sin PK)",
    11: "11 - pesca invalida",
};

export const LAYER_NAMES: Record<1 | 2 | 3 | 4, string> = {
    1: "Suelo",
    2: "Debajo",
    3: "Encima",
    4: "Techo",
};
