'use strict'

// Custom server para Next.js — envía process.send('ready') cuando el puerto
// está abierto. PM2 espera esta señal (wait_ready: true) antes de matar el
// proceso anterior, eliminando el gap de "Bad Gateway" durante deployments.

const http = require('http')
const { parse } = require('url')
const next = require('next')

const port = parseInt(process.env.PORT, 10) || 3003
const app = next({ dev: false })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  http
    .createServer((req, res) => {
      handle(req, res, parse(req.url, true))
    })
    .listen(port, (err) => {
      if (err) throw err
      // Señal a PM2: el servidor ya está escuchando, es seguro matar el proceso viejo
      if (process.send) process.send('ready')
      console.log(`> pos-tienda listo en http://localhost:${port}`)
    })
})
