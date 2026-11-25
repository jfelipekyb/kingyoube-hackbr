// Carrega .env.local/.env para os scripts de linha de comando (o Next faz isso sozinho no app).
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
