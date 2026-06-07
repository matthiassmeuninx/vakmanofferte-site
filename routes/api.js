/**
 * VAKMAN OFFERTE — REST API Routes
 * ============================================================
 * API endpoints voor het dashboard en instellingen.
 * Later te beveiligen met Supabase authenticatie.
 *
 * Endpoints:
 *   GET  /api/gebruiker/:nummer       - Haal profiel op
 *   PUT  /api/gebruiker/:nummer       - Update profiel
 *   GET  /api/offertes/:nummer        - Alle offertes van vakman
 *   GET  /api/tarieven/:nummer        - Tarieven van vakman
 *   PUT  /api/tarieven/:nummer        - Update tarieven
 *   GET  /api/pdf/:offerteId          - Download PDF
 * ============================================================
 */

const express = require('express')
const router  = express.Router()
const path    = require('path')
const fs      = require('fs')

const db      = require('../db/store')
const pdfSvc  = require('../services/pdf')

const PDF_MAP = path.join(__dirname, '..', 'pdfs')

// ── Haal gebruikersprofiel op ──────────────────────────────
router.get('/gebruiker/:nummer', (req, res) => {
  try {
    const gebruiker = db.haalGebruikerOp(req.params.nummer)
    res.json({ succes: true, gebruiker })
  } catch (fout) {
    res.status(500).json({ succes: false, fout: fout.message })
  }
})

// ── Update gebruikersprofiel ───────────────────────────────
router.put('/gebruiker/:nummer', (req, res) => {
  try {
    const gebruiker = db.updateGebruiker(req.params.nummer, req.body)
    res.json({ succes: true, gebruiker })
  } catch (fout) {
    res.status(500).json({ succes: false, fout: fout.message })
  }
})

// ── Haal alle offertes op ──────────────────────────────────
router.get('/offertes/:nummer', (req, res) => {
  try {
    const offertes = db.haalOfferteOp(req.params.nummer)
    res.json({ succes: true, offertes, totaal: offertes.length })
  } catch (fout) {
    res.status(500).json({ succes: false, fout: fout.message })
  }
})

// ── Haal tarieven op ───────────────────────────────────────
router.get('/tarieven/:nummer', (req, res) => {
  try {
    const gebruiker = db.haalGebruikerOp(req.params.nummer)
    res.json({
      succes:     true,
      tarieven:   gebruiker.tarieven,
      materialen: gebruiker.materialen
    })
  } catch (fout) {
    res.status(500).json({ succes: false, fout: fout.message })
  }
})

// ── Update tarieven ────────────────────────────────────────
router.put('/tarieven/:nummer', (req, res) => {
  try {
    const { tarieven, materialen } = req.body
    const gebruiker = db.updateGebruiker(req.params.nummer, {
      tarieven,
      materialen
    })
    res.json({ succes: true, gebruiker })
  } catch (fout) {
    res.status(500).json({ succes: false, fout: fout.message })
  }
})

// ── Download PDF ───────────────────────────────────────────
router.get('/pdf/:offerteId', async (req, res) => {
  try {
    // Zoek de offerte in de database
    const store    = require('../db/store')
    const alleOff  = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'db', 'data.json'))
    ).offertes

    const offerte = alleOff.find(o => o.id === req.params.offerteId)
    if (!offerte) {
      return res.status(404).json({ fout: 'Offerte niet gevonden' })
    }

    const gebruiker = db.haalGebruikerOp(offerte.vakmanNummer)

    // Genereer PDF
    const pdfPad = await pdfSvc.genereerPDF(offerte, gebruiker)

    // Stuur PDF als download
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${offerte.offerteNummer}.pdf"`
    )
    fs.createReadStream(pdfPad).pipe(res)

  } catch (fout) {
    console.error('❌ PDF download fout:', fout.message)
    res.status(500).json({ succes: false, fout: fout.message })
  }
})

// ── Dashboard statistieken ─────────────────────────────────
router.get('/stats/:nummer', (req, res) => {
  try {
    const offertes = db.haalOfferteOp(req.params.nummer)
    const nu       = new Date()
    const dezeMaand = nu.getMonth()

    const stats = {
      totaalOffertes: offertes.length,
      dezeMaand: offertes.filter(o =>
        new Date(o.opgeslagenOp).getMonth() === dezeMaand
      ).length,
      totaleWaarde: offertes.reduce((s, o) => s + (+o.subtotaal || 0), 0),
      goedgekeurd:  offertes.filter(o => o.status === 'goedgekeurd').length,
      concept:      offertes.filter(o => o.status === 'concept').length
    }

    res.json({ succes: true, stats })
  } catch (fout) {
    res.status(500).json({ succes: false, fout: fout.message })
  }
})

module.exports = router 
