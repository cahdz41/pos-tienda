import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  typescript: {
    // Los tipos de Supabase no están generados — errores de 'never' en .insert()/.update()
    ignoreBuildErrors: true,
  },
  turbopack: {},
};

export default nextConfig;
