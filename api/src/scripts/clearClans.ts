import pool from "../db";

async function main() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        
        // 1. Unlink clan from characters
        const charRes = await client.query("UPDATE characters SET clan_id = NULL WHERE clan_id IS NOT NULL");
        console.log(`Unlinked clans from ${charRes.rowCount} characters.`);

        // 2. Delete clan sub-tables if existing (or let cascade work)
        await client.query("DELETE FROM clan_vault_items");
        await client.query("DELETE FROM clan_vaults");
        await client.query("DELETE FROM clan_requests");
        await client.query("DELETE FROM clan_members");

        // 3. Delete clans
        const clanRes = await client.query("DELETE FROM clans");
        console.log(`Deleted ${clanRes.rowCount} clans from database.`);

        await client.query("COMMIT");
        console.log("Successfully cleared all clans from database!");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

main()
    .catch(async (error) => {
        console.error("Error clearing clans:", error);
        await pool.end().catch(() => undefined);
        process.exit(1);
    })
    .finally(async () => {
        await pool.end();
    });
