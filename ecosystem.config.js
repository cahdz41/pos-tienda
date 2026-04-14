module.exports = {
  apps: [
    {
      name: 'pos-v2',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/var/www/pos-v2',
      instances: 1,
      exec_mode: 'fork',
      port: 3000,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Reinicio automático si la memoria supera 500MB
      max_memory_restart: '500M',
      // No reiniciar si falla más de 10 veces en 30 segundos (evita loop infinito)
      max_restarts: 10,
      min_uptime: '30s',
      // Logs
      out_file: '/var/log/pm2/pos-v2-out.log',
      error_file: '/var/log/pm2/pos-v2-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
