/**
 * VAKMAN OFFERTE — Database
 * ============================================================
 * Simpele JSON-bestand database om te starten.
 * Later te vervangen door Supabase voor echte productie.
 *
 * Alle data wordt opgeslagen in /db/data.json
 * ============================================================
 */

const fs   = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

// Pad naar het data bestand
const DATA_BESTAND = path.join(__dirname, 'data.json')

// ── Initialiseer lege database als het bestand niet bestaat ──
function initDb() {
  if (!fs.existsSync(DATA_BESTAND)) {
    const leegDb = {
      gebruikers: {},
      offertes: [],
      gesprekken: {}
    }
    fs.writeFileSync(DATA_BESTAND, JSON.stringify(leegDb, null, 2))
    console.log('📦 Database aangemaakt:', DATA_BESTAND)
  }
}

// ── Lees alle data ─────────────────────────────────────────
function leesDb() {
  initDb()
  const inhoud = fs.readFileSync(DATA_BESTAND, 'utf-8')
  return JSON.parse(inhoud)
}

// ── Schrijf data terug ─────────────────────────────────────
function schrijfDb(data) {
  fs.writeFileSync(DATA_BESTAND, JSON.stringify(data, null, 2))
}

// ══════════════════════════════════════════════════════════
// GEBRUIKERS
// Een gebruiker = één vakman met zijn eigen profiel en tarieven
// De sleutel is zijn WhatsApp-nummer (uniek per vakman)
// ══════════════════════════════════════════════════════════

/**
 * Zoek een gebruiker op zijn WhatsApp-nummer
 * Als hij niet bestaat, maak hem aan (nieuw account)
 */
function haalGebruikerOp(whatsappNummer) {
  const db = leesDb()

  if (!db.gebruikers[whatsappNummer]) {
    // Nieuwe gebruiker — eerste keer dat hij de bot aanspreekt
    db.gebruikers[whatsappNummer] = {
      id: uuidv4(),
      whatsappNummer: whatsappNummer,
      aangemaakt: new Date().toISOString(),
      // Profiel
      profiel: {
        bedrijfsnaam: '',
        btwNummer: '',
        telefoon: whatsappNummer,
        email: '',
        adres: ''
      },
      // Persoonlijke tarieven
      tarieven: {
        uurtarief: 70,           // €/uur — standaard
        verplaatsing: 35,         // € forfait per bezoek
        minimumUren: 1,           // minimum aan te rekenen uren
        spoedToeslag: 50          // % toeslag voor spoedwerken
      },
      // Standaard materialen die deze vakman vaak gebruikt
      materialen: [
        { naam: 'Grohe Eurosmart mengkraan', prijs: 88, eenheid: 'stuk' },
        { naam: 'Koperleiding 15mm',          prijs: 11, eenheid: 'm'    },
        { naam: 'Afdichtingsset sanitair',    prijs: 18, eenheid: 'stuk' }
      ],
      // Plan: starter = gratis, pro = €39/mnd, proplus = €59/mnd
      plan: 'starter',
      offertesTezeMaand: 0,
      offertesMaand: new Date().getMonth()
    }
    schrijfDb(db)
    console.log(`👤 Nieuwe gebruiker aangemaakt: ${whatsappNummer}`)
  }

  return db.gebruikers[whatsappNummer]
}

/**
 * Sla een bijgewerkt gebruikersprofiel op
 */
function updateGebruiker(whatsappNummer, updates) {
  const db = leesDb()
  if (!db.gebruikers[whatsappNummer]) return null

  // Merge de updates met het bestaande profiel
  db.gebruikers[whatsappNummer] = {
    ...db.gebruikers[whatsappNummer],
    ...updates,
    whatsappNummer // nummer mag nooit veranderen
  }

  schrijfDb(db)
  return db.gebruikers[whatsappNummer]
}

// ══════════════════════════════════════════════════════════
// OFFERTES
// ══════════════════════════════════════════════════════════

/**
 * Sla een nieuwe offerte op
 */
function slaOffertOp(offerte) {
  const db = leesDb()

  const nieuweOfferte = {
    ...offerte,
    id: uuidv4(),
    opgeslagenOp: new Date().toISOString(),
    status: 'concept'   // concept → goedgekeurd → verstuurd
  }

  db.offertes.push(nieuweOfferte)
  schrijfDb(db)

  console.log(`📄 Offerte opgeslagen: ${nieuweOfferte.offerteNummer}`)
  return nieuweOfferte
}

/**
 * Haal alle offertes op van één vakman
 */
function haalOfferteOp(whatsappNummer) {
  const db = leesDb()
  return db.offertes
    .filter(o => o.vakmanNummer === whatsappNummer)
    .sort((a, b) => new Date(b.opgeslagenOp) - new Date(a.opgeslagenOp))
}

/**
 * Genereer het volgende offertenummer voor een vakman
 * Formaat: OFF-0001, OFF-0002, ...
 */
function volgendOfferteNummer(whatsappNummer) {
  const offertes = haalOfferteOp(whatsappNummer)
  const volgend  = offertes.length + 1
  return `OFF-${String(volgend).padStart(4, '0')}`
}

/**
 * Update de status van een offerte (bv. na goedkeuring)
 */
function updateOfferteStatus(offerteId, nieuweStatus) {
  const db = leesDb()
  const idx = db.offertes.findIndex(o => o.id === offerteId)

  if (idx === -1) return null

  db.offertes[idx].status = nieuweStatus
  db.offertes[idx].statusGewijzigdOp = new Date().toISOString()

  schrijfDb(db)
  return db.offertes[idx]
}

// ══════════════════════════════════════════════════════════
// GESPREKSSTATUS
// Bijhouden in welke fase van het gesprek een vakman zit
// Zodat de bot weet wat hij verwacht (bv. wachten op bevestiging)
// ══════════════════════════════════════════════════════════

/**
 * Sla de huidige staat van een gesprek op
 */
function slaGesprekOp(whatsappNummer, staat) {
  const db = leesDb()
  db.gesprekken[whatsappNummer] = {
    ...staat,
    bijgewerktOp: new Date().toISOString()
  }
  schrijfDb(db)
}

/**
 * Haal de huidige staat van een gesprek op
 */
function haalGesprekOp(whatsappNummer) {
  const db = leesDb()
  return db.gesprekken[whatsappNummer] || null
}

/**
 * Verwijder de gespreksstatus (na afronding)
 */
function verwijderGesprek(whatsappNummer) {
  const db = leesDb()
  delete db.gesprekken[whatsappNummer]
  schrijfDb(db)
}

module.exports = {
  haalGebruikerOp,
  updateGebruiker,
  slaOffertOp,
  haalOfferteOp,
  volgendOfferteNummer,
  updateOfferteStatus,
  slaGesprekOp,
  haalGesprekOp,
  verwijderGesprek
}
