let spells: number[] = [];
let armors: number[] = [];

try {
    const itemsData = require("../../../.gemini/antigravity/brain/c46b8fdf-3fc1-48e1-af5b-37b2a996c0c8/scratch/npc_items.json");
    spells = itemsData.spells || [];
    armors = itemsData.armors || [];
} catch {
    spells = [];
    armors = [];
}

export function ensureCustomNpcs(datNpc: Record<number, any>): void {
    if (!datNpc[9901]) {
        datNpc[9901] = {
            id: 9901,
            name: "Vendedor de Hechizos",
            npcType: 10,
            idHead: 110,
            idBody: 46,
            movement: 1,
            desc: "¡Pasa y aprende todas las artes mágicas por solo 1 moneda de oro!",
            objs: spells.map((id: number) => ({ cant: 1000, item: id, price: 1 })),
            drop: [],
            gold: 0,
            hp: 0,
            maxHp: 0,
            minHit: 0,
            maxHit: 0,
            def: 0,
            poderAtaque: 0,
            poderEvasion: 0,
            magicResistance: 0,
            magicDef: 0,
            defM: 0,
            snd1: 0,
            snd2: 0,
            soundClose: 0,
            aguaValida: 0,
            tierraInvalida: 0,
        };
    }

    if (!datNpc[9902]) {
        datNpc[9902] = {
            id: 9902,
            name: "Vendedor de Armaduras",
            npcType: 10,
            idHead: 505,
            idBody: 199,
            movement: 1,
            desc: "¡Tengo todas las vestimentas y armaduras del reino a solo 1 moneda de oro!",
            objs: armors.map((id: number) => ({ cant: 1000, item: id, price: 1 })),
            drop: [],
            gold: 0,
            hp: 0,
            maxHp: 0,
            minHit: 0,
            maxHit: 0,
            def: 0,
            poderAtaque: 0,
            poderEvasion: 0,
            magicResistance: 0,
            magicDef: 0,
            defM: 0,
            snd1: 0,
            snd2: 0,
            soundClose: 0,
            aguaValida: 0,
            tierraInvalida: 0,
        };
    }
}
