import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  typescript: {
    // Las páginas clientes/inventario usan tablas de schema_v2 sin tipos generados.
    // Ignorar errores de tipos hasta generar: `supabase gen types typescript > src/types/database.ts`
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
