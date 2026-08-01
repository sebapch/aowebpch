import pool from "../db";

async function main() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Unlink clan_id from characters
        await client.query("UPDATE characters SET clan_id = NULL WHERE clan_id IS NOT NULL");

        // 2. Delete clans (which cascades to clan_members, clan_requests, clan_vaults, clan_vault_items)
        const clanRes = await client.query("DELETE FROM clans");
        console.log(`Deleted ${clanRes.rowCount} clans.`);

        // 3. Delete characters (which cascades to all character sub-tables)
        const charRes = await client.query("DELETE FROM characters");
        console.log(`Deleted ${charRes.rowCount} characters.`);

        await client.query("COMMIT");
        console.log("Successfully cleared all characters and clans from database!");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

main()
    .catch(async (error) => {
        console.error("Error clearing characters and clans:", error);
        await pool.end().catch(() => undefined);
        process.exit(1);
    })
    .finally(async () => {
        await pool.end();
    });
