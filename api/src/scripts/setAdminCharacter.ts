import pool from "../db";

async function main() {
    try {
        const searchName = process.argv[2] || "admin";
        console.log(`Buscando personaje con nombre (case-insensitive): "${searchName}"...`);
        
        const findRes = await pool.query(
            "SELECT id, name, privileges, level, account_id FROM characters WHERE LOWER(name) = LOWER($1)",
            [searchName]
        );

        if (findRes.rows.length === 0) {
            console.log(`No se encontró ningún personaje llamado "${searchName}".`);
            const allChars = await pool.query("SELECT id, name, privileges FROM characters LIMIT 10");
            console.log("Personajes existentes en la base de datos:", allChars.rows);
            return;
        }

        console.log("Personaje encontrado:", findRes.rows);

        const updateRes = await pool.query(
            "UPDATE characters SET privileges = 1 WHERE LOWER(name) = LOWER($1) RETURNING id, name, privileges",
            [searchName]
        );

        console.log("Actualización exitosa! Datos actualizados:", updateRes.rows);
    } catch (err) {
        console.error("Error al actualizar administrador:", err);
    } finally {
        await pool.end();
    }
}

main();
