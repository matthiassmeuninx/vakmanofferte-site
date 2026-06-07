/**
 * VAKMAN OFFERTE — WhatsApp Webhook Route
 * ============================================================
 * Dit is de kern van de hele applicatie.
 * Elk WhatsApp-bericht van een vakman komt hier binnen.
 *
 * Flow:
 * 1. 360dialog stuurt het bericht naar /webhook/whatsapp
 * 2. Wij lezen het bericht (tekst, foto, of voice)
 * 3. We roepen Claude aan om een offerte te genereren
 * 4. We sturen de offerte terug via WhatsApp
 * 5. Vakman zegt JA → PDF wordt aangemaakt
 * ============================================================
 */

const express = require('express')
const router  = express.Router()

const db        = require('../db/store')
const claude    = require('../services/claude')
const whatsapp  = require('../services/whatsapp')
const pdfSvc    = require('../services/pdf')

// ── Webhook verificatie (GET) ──────────────────────────────
// 360dialog doet dit eenmalig bij het instellen van de webhook
router.get('/whatsapp', (req, res) => {
  whatsapp.verifieerWebhook(req, res)
})

// ── Inkomend WhatsApp bericht (POST) ──────────────────────
// Elk bericht van een vakman komt hier binnen
router.post('/whatsapp', async (req, res) => {
  // Stuur meteen 200 terug aan 360dialog
  // Als we dit niet doen denken ze dat de webhook faalde
  res.status(200).json({ status: 'ontvangen' })

  // Verwerk het bericht asynchroon
  try {
    await verwerkBericht(req.body)
  } catch (fout) {
    console.error('❌ Fout bij verwerken bericht:', fout.message)
  }
})

// ── Hoofdfunctie: verwerk een inkomend bericht ─────────────
async function verwerkBericht(webhookData) {
  // Haal het bericht op uit de webhook payload
  const berichten = webhookData?.messages
  if (!berichten || berichten.length === 0) return

  for (const bericht of berichten) {
    await verwerkEnkelBericht(bericht, webhookData)
  }
}

async function verwerkEnkelBericht(bericht, webhookData) {
  const vanNummer = bericht.from
  const type      = bericht.type

  console.log(`\n📱 Nieuw bericht van ${vanNummer} (type: ${type})`)

  // Haal de gebruiker op (of maak aan als nieuw)
  const gebruiker = db.haalGebruikerOp(vanNummer)
  const gesprek   = db.haalGesprekOp(vanNummer)

  // ── STAP 1: Controleer of dit een bevestiging is ─────────
  // Als de vakman net een offerte ontvangen heeft en JA/NEE stuurt
  if (gesprek && gesprek.wachtOpBevestiging) {
    await verwerkBevestiging(vanNummer, bericht, gesprek, gebruiker)
    return
  }

  // ── STAP 2: Verwerk op basis van berichttype ──────────────
  switch (type) {
    case 'text':
      await verwerkTekstBericht(vanNummer, bericht, gebruiker)
      break

    case 'image':
      await verwerkFotoBericht(vanNummer, bericht, gebruiker)
      break

    case 'audio':
      // Voice memo — in toekomst met Whisper transcriberen
      await whatsapp.stuurTekst(vanNummer,
        '🎙️ Voice memos worden binnenkort ondersteund.\n\nStuur voor nu een tekstbericht met de beschrijving.'
      )
      break

    default:
      await whatsapp.stuurTekst(vanNummer,
        '❓ Ik begrijp dit berichttype niet.\n\nStuur een foto of tekstbericht met de beschrijving van het werk.'
      )
  }
}

// ── Verwerk een tekstbericht ───────────────────────────────
async function verwerkTekstBericht(vanNummer, bericht, gebruiker) {
  const tekst = bericht.text?.body?.trim()
  if (!tekst) return

  console.log(`💬 Tekst: "${tekst.substring(0, 80)}..."`)

  // Controleer op speciale commando's
  if (tekst.toLowerCase() === 'help' || tekst.toLowerCase() === '?') {
    await whatsapp.stuurWelkom(vanNummer)
    return
  }

  // Is dit de eerste keer? Stuur welkomstbericht
  if (!gebruiker.profiel.bedrijfsnaam && !gebruiker.eersteKeerGesproken) {
    await whatsapp.stuurWelkom(vanNummer)
    db.updateGebruiker(vanNummer, { eersteKeerGesproken: true })
  }

  // Detecteer BTW-tarief uit de tekst
  const btwTarief = detecteerBTW(tekst)

  // Genereer offertenummer
  const offerteNr = db.volgendOfferteNummer(vanNummer)

  // Laat de vakman weten dat we bezig zijn
  await whatsapp.stuurTekst(vanNummer,
    `⚙️ Offerte ${offerteNr} wordt aangemaakt...\n_(duurt max 15 seconden)_`
  )

  try {
    // Roep Claude aan voor offerte generatie
    const offerte = await claude.genereerOfferte(
      tekst, gebruiker, btwTarief, offerteNr
    )

    // Voeg vakman info toe
    offerte.vakmanNummer = vanNummer

    // Sla op als concept
    const opgeslagen = db.slaOffertOp(offerte)

    // Stuur samenvatting terug
    await whatsapp.stuurOfferteSamenvatting(vanNummer, offerte)

    // Onthoud dat we wachten op bevestiging
    db.slaGesprekOp(vanNummer, {
      wachtOpBevestiging: true,
      offerteId: opgeslagen.id,
      offerte: offerte
    })

  } catch (fout) {
    console.error('❌ Claude fout:', fout.message)
    await whatsapp.stuurFout(vanNummer)
  }
}

// ── Verwerk een fotobericht ────────────────────────────────
async function verwerkFotoBericht(vanNummer, bericht, gebruiker) {
  const mediaId   = bericht.image?.id
  const bijschrift = bericht.image?.caption || ''

  if (!mediaId) return

  console.log(`📸 Foto ontvangen: ${mediaId}`)

  // Bevestig ontvangst
  await whatsapp.stuurTekst(vanNummer,
    '📸 Foto ontvangen!\n⚙️ AI analyseert de situatie en maakt offerte...\n_(duurt max 20 seconden)_'
  )

  try {
    // Download de foto van WhatsApp servers
    const { base64, mimeType } = await whatsapp.downloadFoto(mediaId)

    // Detecteer BTW uit het bijschrift
    const btwTarief = detecteerBTW(bijschrift)

    // Genereer offertenummer
    const offerteNr = db.volgendOfferteNummer(vanNummer)

    // Stuur foto + bijschrift naar Claude
    const offerte = await claude.analyseerFotoEnGenereer(
      base64, mimeType, bijschrift, gebruiker, btwTarief, offerteNr
    )

    offerte.vakmanNummer = vanNummer

    // Sla op
    const opgeslagen = db.slaOffertOp(offerte)

    // Stuur samenvatting
    await whatsapp.stuurOfferteSamenvatting(vanNummer, offerte)

    // Wacht op bevestiging
    db.slaGesprekOp(vanNummer, {
      wachtOpBevestiging: true,
      offerteId: opgeslagen.id,
      offerte: offerte
    })

    // Extra info als Claude de foto kon analyseren
    if (offerte.fotoAnalyse) {
      await whatsapp.stuurTekst(vanNummer,
        `🔍 *Wat ik zag op de foto:*\n${offerte.fotoAnalyse}`
      )
    }

  } catch (fout) {
    console.error('❌ Foto verwerking fout:', fout.message)
    await whatsapp.stuurFout(vanNummer)
  }
}

// ── Verwerk bevestiging (JA / NEE) ────────────────────────
async function verwerkBevestiging(vanNummer, bericht, gesprek, gebruiker) {
  const tekst = bericht.text?.body?.trim().toUpperCase() || ''

  const isJa  = ['JA', 'YES', 'OK', 'GOED', '✅', 'AKKOORD', 'GOEDGEKEURD'].includes(tekst)
  const isNee = ['NEE', 'NO', 'AANPASSEN', '❌', 'FOUT', 'NIET GOED'].includes(tekst)

  if (isJa) {
    // ── Vakman keurt goed ──────────────────────────────────
    console.log(`✅ Offerte goedgekeurd door ${vanNummer}`)

    await whatsapp.stuurTekst(vanNummer, '✅ Goedgekeurd! PDF wordt aangemaakt...')

    try {
      // Genereer de PDF
      const pdfPad = await pdfSvc.genereerPDF(gesprek.offerte, gebruiker)

      // Update status in database
      db.updateOfferteStatus(gesprek.offerteId, 'goedgekeurd')

      // Stuur bevestiging
      await whatsapp.stuurBevestiging(vanNummer, gesprek.offerte.offerteNummer)

      // In productie: upload PDF naar cloud en stuur download link
      // Voor nu: meld dat de PDF klaar staat
      await whatsapp.stuurTekst(vanNummer,
        `📥 Offerte ${gesprek.offerte.offerteNummer} PDF is klaar.\n\nDownload via:\nhttps://jouwserver.be/pdf/${gesprek.offerteId}\n\n_Volgende offerte? Stuur gewoon een foto of bericht._`
      )

    } catch (fout) {
      console.error('❌ PDF fout:', fout.message)
      await whatsapp.stuurTekst(vanNummer,
        '⚠️ PDF generatie mislukt. Contacteer support: info@vakmanofferte.be'
      )
    }

    // Verwijder gespreksstatus
    db.verwijderGesprek(vanNummer)

  } else if (isNee) {
    // ── Vakman wil aanpassen ────────────────────────────────
    await whatsapp.stuurTekst(vanNummer,
      '❌ Geen probleem! Wat moet er anders?\n\nBeschrijf de aanpassing en ik genereer een nieuwe versie.'
    )
    db.verwijderGesprek(vanNummer)

  } else {
    // ── Onduidelijk antwoord ────────────────────────────────
    await whatsapp.stuurTekst(vanNummer,
      'Tik *JA* om de offerte goed te keuren\nTik *NEE* om aan te passen'
    )
  }
}

// ── Hulpfunctie: detecteer BTW-tarief uit tekst ────────────
/**
 * Zoek naar aanwijzingen over het BTW-tarief in de tekst
 * @param {string} tekst - De tekst van de vakman
 * @returns {string} - '6', '21' of '0'
 */
function detecteerBTW(tekst) {
  if (!tekst) return '21'

  const lower = tekst.toLowerCase()

  // Expliciet vermeld
  if (lower.includes('6%') || lower.includes('btw 6'))       return '6'
  if (lower.includes('21%') || lower.includes('btw 21'))     return '21'
  if (lower.includes('verlegd') || lower.includes('0%'))     return '0'

  // Sleutelwoorden die op renovatie wijzen (6%)
  const renovatie = ['renovatie', 'verbouwing', 'verbouwen', 'herstel',
                     'reparatie', 'oud', 'woning', 'appartement', 'leeftijd']
  if (renovatie.some(w => lower.includes(w)))                return '6'

  // Standaard: 21%
  return '21'
}

module.exports = router  
