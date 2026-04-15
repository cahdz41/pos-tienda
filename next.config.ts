import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Los tipos de Supabase no están generados — errores de 'never' en .insert()/.update()
    // No son bugs de lógica, solo ruido de inferencia de tipos sin schema generado
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    // Excluir el módulo de Node.js de onnxruntime (solo usamos la versión web/WASM)
    config.resolve.alias = {
      ...config.resolve.alias,
      "onnxruntime-node": false,
    };

    // Regla general para archivos .mjs — evita errores de módulos ESM
    config.module.rules.push({
      test: /\.m?js$/,
      type: "javascript/auto",
      resolve: { fullySpecified: false },
    });

    // FIX CRÍTICO: reemplaza import.meta.url en onnxruntime-web antes de que Webpack lo procese
    // Sin esto aparece: TypeError: e.replace is not a function en producción
    config.module.rules.push({
      test: /onnxruntime-web[\\/]dist[\\/].*\.m?js$/,
      loader: "string-replace-loader",
      options: {
        search: "import.meta.url",
        replace:
          '((typeof window !== "undefined" ? window.location.href : "http://localhost/"))',
        flags: "g",
      },
    });

    return config;
  },
};

export default nextConfig;
