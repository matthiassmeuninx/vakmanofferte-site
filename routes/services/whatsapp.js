/**
 * VAKMAN OFFERTE — WhatsApp Service
 * ============================================================
 * Alles voor het versturen van berichten via WhatsApp
 * en het downloaden van foto's die vaklieden sturen.
 *
 * We gebruiken de 360dialog API (whatsapp business provider)
 * ============================================================
 */

const https  = require('https')
const http   = require('http')
const axios  = require('axios')

const WA_API_BASE = 'https://waba.360dialog.io/v1'

// ── Verstuur een tekstbericht ──────────────────────────────
/**
 * Stuur een gewoon tekstbericht naar een WhatsApp nummer
 * @param {string} naar   - WhatsApp nummer (bv. +32475123456)
 * @param {string} tekst  - De tekst om te sturen
 */
async function stuurTekst(naar, tekst) {
  try {
    const response = await axios.post(
      `${WA_API_BASE}/messages`,
      {
        recipient_type: 'individual',
        to:   naar,
        type: 'text',
        text: { body: tekst }
      },
      {
        headers: {
          'D360-API-KEY': process.env.WHATSAPP_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    )
    console.log(`📤 Bericht verstuurd naar ${naar}`)
    return response.data
  } catch (fout) {
    console.error('❌ WhatsApp stuur fout:', fout.message)
    throw fout
  }
}

// ── Verstuur een offerte-samenvatting ─────────────────────
/**
 * Stuur een geformatteerde offerte-preview via WhatsApp
 * Met alle posten, BTW en totaal
 * @param {string} naar     - WhatsApp nummer
 * @param {Object} offerte  - Het offerte object
 */
async function stuurOfferteSamenvatting(naar, offerte) {
  const posten = offerte.posten
    .map(p => `  • ${p.beschrijving}: €${(+p.totaal).toFixed(2)}`)
    .join('\n')

  const bericht = `✅ *Offerte ${offerte.offerteNummer} klaar*

📋 *${offerte.omschrijvingWerk}*

*Werkposten:*
${posten}

─────────────────
Subtotaal:     €${(+offerte.subtotaal).toFixed(2)}
BTW ${offerte.btwPercent}%:       €${(+offerte.btwBedrag).toFixed(2)}
*TOTAAL:         €${(+offerte.totaalIncl).toFixed(2)}*

Geldig tot: ${offerte.geldigTot}

Tik *✅ JA* om goed te keuren en de PDF te ontvangen
Tik *❌ NEE* om aan te passen`

  return stuurTekst(naar, bericht)
}

// ── Verstuur bevestiging na goedkeuring ───────────────────
/**
 * Stuur een bevestigingsbericht na goedkeuring van de offerte
 * @param {string} naar       - WhatsApp nummer
 * @param {string} offerteNr  - Het offertenummer
 */
async function stuurBevestiging(naar, offerteNr) {
  const bericht = `🎉 *Offerte ${offerteNr} goedgekeurd!*

De PDF wordt aangemaakt en is klaar om te versturen naar de klant.

📥 Je ontvangt de downloadlink hieronder.

_Nieuwe offerte? Stuur gewoon een nieuw bericht of foto._`

  return stuurTekst(naar, bericht)
}

// ── Verstuur welkomstbericht ───────────────────────────────
/**
 * Welkomstbericht voor nieuwe gebruikers
 * @param {string} naar - WhatsApp nummer
 */
async function stuurWelkom(naar) {
  const bericht = `👋 *Welkom bij VakmanOfferte!*

Ik ben jouw AI-assistent voor het maken van offertes.

*Hoe gebruik je mij?*

📸 Stuur een foto van de situatie op de werf, of...
✍️ Beschrijf in tekst wat je gedaan hebt

_Voorbeeld:_
_"Familie Janssen, Hasselt. Lekkende kraan vervangen, nieuwe Grohe mengkraan geplaatst, 3 uur werk. BTW 6%."_

Ik maak er automatisch een professionele offerte van met jouw tarieven.

_Tip: Stel eerst je tarieven in via het dashboard op vakmanofferte.be_`

  return stuurTekst(naar, bericht)
}

// ── Verstuur foutbericht ───────────────────────────────────
/**
 * Stuur een vriendelijk foutbericht
 * @param {string} naar - WhatsApp nummer
 */
async function stuurFout(naar) {
  const bericht = `⚠️ Er ging iets mis bij het genereren van je offerte.

Probeer het opnieuw of contacteer support:
📧 info@vakmanofferte.be`

  return stuurTekst(naar, bericht)
}

// ── Download een foto van WhatsApp servers ─────────────────
/**
 * Download een foto die een vakman stuurde
 * WhatsApp slaat foto's op hun eigen servers op.
 * We moeten ze eerst downloaden voor we ze naar Claude sturen.
 *
 * @param {string} mediaId - De media ID uit het WhatsApp bericht
 * @returns {Object} { data: Buffer, mimeType: string }
 */
async function downloadFoto(mediaId) {
  try {
    // Stap 1: Haal de download URL op
    const infoResponse = await axios.get(
      `${WA_API_BASE}/media/${mediaId}`,
      {
        headers: {
          'D360-API-KEY': process.env.WHATSAPP_API_KEY
        }
      }
    )

    const downloadUrl = infoResponse.data.url
    const mimeType    = infoResponse.data.mime_type || 'image/jpeg'

    console.log(`📥 Foto downloaden: ${mediaId} (${mimeType})`)

    // Stap 2: Download de eigenlijke foto
    const fotoResponse = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      headers: {
        'D360-API-KEY': process.env.WHATSAPP_API_KEY
      }
    })

    // Converteer naar base64 voor Claude
    const base64 = Buffer.from(fotoResponse.data).toString('base64')

    console.log(`✅ Foto gedownload: ${Math.round(base64.length / 1024)}KB`)

    return {
      base64:   base64,
      mimeType: mimeType
    }
  } catch (fout) {
    console.error('❌ Foto download fout:', fout.message)
    throw new Error('Kon de foto niet downloaden van WhatsApp')
  }
}

// ── Valideer WhatsApp webhook handshake ───────────────────
/**
 * 360dialog stuurt een verificatieverzoek bij het instellen
 * van de webhook. We moeten het token terugsturen.
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function verifieerWebhook(req, res) {
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook geverifieerd')
    res.status(200).send(challenge)
  } else {
    console.error('❌ Webhook verificatie mislukt — verkeerd token')
    res.status(403).send('Verboden')
  }
}

module.exports = {
  stuurTekst,
  stuurOfferteSamenvatting,
  stuurBevestiging,
  stuurWelkom,
  stuurFout,
  downloadFoto,
  verifieerWebhook
}
