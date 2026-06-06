import { db, migrateDatabase } from "./index.js";

await migrateDatabase();
const version = await db.get<{ version: number | null }>("SELECT MAX(version) AS version FROM schema_migrations");
console.log(`Database ready (${db.dialect}, schema version ${version?.version ?? 0}).`);
await db.close();
