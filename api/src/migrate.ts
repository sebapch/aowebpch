import fs from "fs";
import path from "path";
import pool from "./db";
import { repairGuttedGameData } from "./lib/gameDataRepair";

// Arrancar con datos incompletos es malo, pero no arrancar es peor: si la reparacion
// falla el server sigue levantando como hasta ahora y el error queda en el log.
async function repairGameData(): Promise<void> {
    try {
        const result = await repairGuttedGameData();

        if (!result.repaired) {
            console.log("Game data check passed");
        }
    } catch (error) {
        console.error("Failed to repair game data", error);
    }
}

async function migrate(): Promise<void> {
    const schemaPath = path.resolve(__dirname, "..", "schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    await pool.query(schemaSql);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_market_listings_active_price_created
      ON market_listings(price ASC, created_at ASC)
      WHERE status = 'active'
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_market_listings_seller_active_created
      ON market_listings(seller_character_id, created_at DESC)
      WHERE status = 'active'
  `);
    console.log("Database schema applied successfully");

    await repairGameData();
}

void migrate()
    .catch((error) => {
        console.error("Failed to apply database schema", error);
        process.exit(1);
    })
    .finally(async () => {
        await pool.end();
    });
