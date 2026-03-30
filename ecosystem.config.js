module.exports = {
  apps: [
    {
      name: 'pos-tienda',
      script: 'server.js',
      cwd: '/var/www/pos-tienda',
      instances: 1,
      autorestart: true,
      watch: false,
      // PM2 espera process.send('ready') antes de matar el proceso viejo.
      // Elimina el Bad Gateway durante reloads.
      wait_ready: true,
      listen_timeout: 60000, // 60s máx para que Next.js arranque
      kill_timeout: 5000,    // 5s para que el proceso viejo termine requests en curso
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
      },
    },
  ],
}

