import pool from "../db";

async function main() {
    try {
        const res = await pool.query(
            "SELECT id, name, version, updated_at, data FROM game_npcs ORDER BY updated_at DESC LIMIT 10"
        );
        console.log("=== Top 10 NPCs por fecha de actualización ===");
        for (const row of res.rows) {
            console.log(`ID: ${row.id} | Nombre: "${row.name}" | Actualizado: ${row.updated_at} | Objs: ${row.data?.objs?.length ?? 0}`);
            if (row.data?.objs && row.data.objs.length > 0) {
                console.log("   First 3 objs:", row.data.objs.slice(0, 3));
                console.log("   Last 3 objs:", row.data.objs.slice(-3));
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
