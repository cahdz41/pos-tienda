module.exports = {
  apps: [
    {
      name: 'pos-tienda',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/var/www/pos-tienda',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
      },
    },
  ],
}
