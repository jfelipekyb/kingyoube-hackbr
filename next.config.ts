import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O adaptador SIMULADO lê fixtures/receita/ em tempo de execução (inclusive na Vercel).
  outputFileTracingIncludes: {
    "/api/**": ["./fixtures/receita/**/*"],
  },
};

export default nextConfig;
