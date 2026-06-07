/**
 * VAKMAN OFFERTE — Hoofd Server
 * ============================================================
 * Dit is het hart van de applicatie.
 * Alle inkomende requests komen hier binnen.
 * ============================================================
 */

require('dotenv').config()

const express = require('express')
const app = express()

// ── Middleware ─────────────────────────────────────────────
// Express kan JSON en URL-encoded data lezen
app.use(express.json({ limit: '10mb' })) // limit hoog want foto's zijn groot
app.use(express.urlencoded({ extended: true }))

// Simpele logger — elke request wordt geprint
app.use((req, res, next) => {
  const tijd = new Date().toTimeString().substring(0, 8)
  console.log(`[${tijd}] ${req.method} ${req.path}`)
  next()
})

// ── Routes ────────────────────────────────────────────────
const whatsappRoute = require('./routes/whatsapp')
const apiRoute      = require('./routes/api')

// WhatsApp webhook — 360dialog stuurt hier berichten naartoe
app.use('/webhook', whatsappRoute)

// REST API — voor het dashboard en instellingen
app.use('/api', apiRoute)

// Health check — om te controleren of de server draait
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'VakmanOfferte Backend',
    versie: '1.0.0',
    tijd: new Date().toISOString()
  })
})

// ── Error handler ─────────────────────────────────────────
// Als er iets fout gaat, stuur een nette foutmelding
app.use((err, req, res, next) => {
  console.error('❌ Server fout:', err.message)
  res.status(500).json({
    error: 'Interne serverfout',
    bericht: err.message
  })
})

// ── Start server ──────────────────────────────────────────
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log('━'.repeat(50))
  console.log(`⚡ VakmanOfferte Backend draait op poort ${PORT}`)
  console.log(`🌍 URL: http://localhost:${PORT}`)
  console.log(`📱 WhatsApp webhook: http://localhost:${PORT}/webhook/whatsapp`)
  console.log('━'.repeat(50))
})

module.exports = app
