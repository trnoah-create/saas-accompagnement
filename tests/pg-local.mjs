/**
 * Lance un vrai serveur PostgreSQL en mémoire (PGlite) sur le port 5433.
 * Sert à faire tourner l'application en local sans base hébergée :
 *
 *   node tests/pg-local.mjs &
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres npm run dev
 *
 * Les données disparaissent à l'arrêt : c'est un outil de test, pas une base.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create();
// maxConnections vaut 1 par défaut : insuffisant, car Next sépare les pages
// et les routes d'API en bundles distincts, chacun ouvrant son propre pool.
const server = new PGLiteSocketServer({
  db,
  port: 5433,
  host: "127.0.0.1",
  maxConnections: 10,
});
await server.start();
console.log("PostgreSQL local prêt sur 127.0.0.1:5433");

const arret = async () => {
  await server.stop();
  process.exit(0);
};
process.on("SIGTERM", arret);
process.on("SIGINT", arret);
