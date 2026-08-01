import pool from "../db";

async function main() {
    try {
        const npcs = await pool.query("SELECT id, name, data FROM game_npcs");
        const objs = await pool.query("SELECT id, name FROM game_objects");
        const validObjIds = new Set(objs.rows.map((r) => Number(r.id)));
        
        console.log("Total valid objects in DB:", validObjIds.size);
        let missingCount = 0;

        for (const npc of npcs.rows) {
            const objsArr = npc.data?.objs;
            if (Array.isArray(objsArr)) {
                for (const entry of objsArr) {
                    const itemId = Number(entry?.item);
                    if (itemId > 0 && !validObjIds.has(itemId)) {
                        console.log(`[MISSING ITEM] NPC ${npc.id} (${npc.name}) tiene el item ID ${itemId} que NO existe en game_objects!`);
                        missingCount++;
                    }
                }
            }
        }
        console.log("Total missing item references:", missingCount);
    } catch (err) {
        console.error("Error al verificar items de NPCs:", err);
    } finally {
        await pool.end();
    }
}

main();
