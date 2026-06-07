/**
 * VAKMAN OFFERTE — Claude AI Service
 * ============================================================
 * Alle communicatie met de Claude API zit hier.
 * Twee functies:
 *   1. genereerOfferte()  — tekst naar offerte
 *   2. analyseerFoto()    — foto + tekst naar offerte
 * ============================================================
 */

const https = require('https')

const CLAUDE_MODEL   = 'claude-sonnet-4-20250514'
const MAX_TOKENS     = 2000
const API_URL_HOST   = 'api.anthropic.com'
const API_URL_PATH   = '/v1/messages'

// ── Basis API aanroep ──────────────────────────────────────
/**
 * Stuur een verzoek naar de Claude API
 * @param {Array} berichten - Array van { role, content } objecten
 * @returns {string} - De tekstuele response van Claude
 */
function roepClaudeAan(berichten) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:      CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      messages:   berichten
    })

    const opties = {
      hostname: API_URL_HOST,
      path:     API_URL_PATH,
      method:   'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length':  Buffer.byteLength(body)
      }
    }

    const req = https.request(opties, (res) => {
      let data = ''
      res.on('data', stuk => data += stuk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)

          // API fout afhandelen
          if (parsed.error) {
            reject(new Error(`Claude API fout: ${parsed.error.message}`))
            return
          }

          // Haal de tekstuele response op
          const tekst = parsed.content?.[0]?.text
          if (!tekst) {
            reject(new Error('Geen tekst in Claude response'))
            return
          }

          resolve(tekst)
        } catch (e) {
          reject(new Error(`JSON parse fout: ${e.message}`))
        }
      })
    })

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── Bouw de systeem-prompt op met tarieven van de vakman ───
/**
 * Maak een gedetailleerde prompt met de persoonlijke tarieven
 * @param {Object} gebruiker - Gebruikersobject uit de database
 * @returns {string} - De prompt met tarieven
 */
function bouwTarievenContext(gebruiker) {
  const t = gebruiker.tarieven
  const m = gebruiker.materialen

  let context = `JE BENT een Belgische offerte-assistent voor vaklieden.

PERSOONLIJKE TARIEVEN VAN DEZE VAKMAN:
- Uurtarief: €${t.uurtarief}/uur
- Verplaatsingskosten: €${t.verplaatsing} forfait per bezoek
- Minimum aanrekening: ${t.minimumUren} uur`

  if (m && m.length > 0) {
    context += '\n\nSTANDAARD MATERIALEN VAN DEZE VAKMAN (gebruik deze prijzen):'
    m.forEach(mat => {
      context += `\n- ${mat.naam}: €${mat.prijs}/${mat.eenheid}`
    })
  }

  context += `

BEDRIJFSGEGEVENS:
- Bedrijfsnaam: ${gebruiker.profiel.bedrijfsnaam || 'Vakman'}
- BTW-nummer: ${gebruiker.profiel.btwNummer || 'in te vullen'}

REGELS:
1. Gebruik ALTIJD de tarieven hierboven — wijk alleen af als de vakman iets anders zegt
2. Splits arbeid en materialen in aparte posten
3. Voeg verplaatsingskosten toe tenzij de vakman zegt dat dit niet nodig is
4. Bereken btw correct: subtotaal × btw-percentage / 100
5. Schrijf professionele Nederlandse omschrijvingen per post
6. Stel de geldigheid op 30 dagen na vandaag

ANTWOORD UITSLUITEND MET GELDIG JSON — geen uitleg, geen markdown, geen tekst ervoor of erna.`

  return context
}

// ── Offerte genereren uit tekst ────────────────────────────
/**
 * Genereer een offerte op basis van een tekstbeschrijving
 * @param {string} beschrijving - Wat de vakman gestuurd heeft
 * @param {Object} gebruiker    - Vakman uit de database
 * @param {string} btwTarief   - '6', '21' of '0'
 * @param {string} offerteNr   - bv. 'OFF-0001'
 * @returns {Object} - Offerte als JSON object
 */
async function genereerOfferte(beschrijving, gebruiker, btwTarief, offerteNr) {
  const vandaag   = new Date().toLocaleDateString('nl-BE')
  const geldigTot = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('nl-BE')

  const systeemContext = bouwTarievenContext(gebruiker)

  const prompt = `${systeemContext}

BESCHRIJVING VAN DE VAKMAN:
"${beschrijving}"

BTW-TARIEF: ${btwTarief}%
DATUM: ${vandaag}
OFFERTE NUMMER: ${offerteNr}

Genereer de offerte in dit exacte JSON formaat:
{
  "klantNaam": "naam van de klant",
  "klantAdres": "adres van de klant",
  "klantEmail": "",
  "datum": "${vandaag}",
  "offerteNummer": "${offerteNr}",
  "geldigTot": "${geldigTot}",
  "omschrijvingWerk": "professionele samenvatting van het werk in 1-2 zinnen",
  "posten": [
    {
      "categorie": "arbeid",
      "beschrijving": "omschrijving van de post",
      "aantal": 1,
      "eenheid": "uur",
      "eenheidsprijs": 70,
      "totaal": 70
    }
  ],
  "subtotaal": 0,
  "btwPercent": ${btwTarief},
  "btwBedrag": 0,
  "totaalIncl": 0,
  "betaaltermijn": "30 dagen",
  "notities": ""
}`

  const tekst = await roepClaudeAan([
    { role: 'user', content: prompt }
  ])

  // Strip markdown code fences als Claude die toch toevoegt
  const schoon = tekst.replace(/```json|```/g, '').trim()
  return JSON.parse(schoon)
}

// ── Offerte genereren uit foto + tekst ────────────────────
/**
 * Analyseer een foto en genereer een offerte
 * @param {string} fotoBase64    - De foto als base64 string
 * @param {string} mimeType      - 'image/jpeg' of 'image/png'
 * @param {string} beschrijving  - Extra tekst van de vakman
 * @param {Object} gebruiker     - Vakman uit de database
 * @param {string} btwTarief    - '6', '21' of '0'
 * @param {string} offerteNr    - bv. 'OFF-0001'
 * @returns {Object} - Offerte als JSON object
 */
async function analyseerFotoEnGenereer(fotoBase64, mimeType, beschrijving, gebruiker, btwTarief, offerteNr) {
  const vandaag   = new Date().toLocaleDateString('nl-BE')
  const geldigTot = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('nl-BE')

  const systeemContext = bouwTarievenContext(gebruiker)

  const tekstPrompt = `${systeemContext}

ANALYSEER DE FOTO en de beschrijving hieronder.

Kijk op de foto naar:
- Type installatie of constructie (loodgieterij, elektriciteit, schilderwerk, etc.)
- Zichtbare problemen (lekkage, beschadiging, slijtage, etc.)
- Omvang van het werk (klein herstel, grote renovatie, etc.)
- Materialen die waarschijnlijk nodig zijn

EXTRA BESCHRIJVING VAN VAKMAN:
"${beschrijving || 'Geen extra beschrijving'}"

BTW-TARIEF: ${btwTarief}%
DATUM: ${vandaag}
OFFERTE NUMMER: ${offerteNr}

Genereer de offerte in dit exacte JSON formaat:
{
  "klantNaam": "naam van de klant indien vermeld, anders leeg",
  "klantAdres": "adres indien vermeld, anders leeg",
  "klantEmail": "",
  "datum": "${vandaag}",
  "offerteNummer": "${offerteNr}",
  "geldigTot": "${geldigTot}",
  "fotoAnalyse": "korte beschrijving van wat je zag op de foto",
  "omschrijvingWerk": "professionele samenvatting van het werk in 1-2 zinnen",
  "posten": [
    {
      "categorie": "arbeid",
      "beschrijving": "omschrijving van de post",
      "aantal": 1,
      "eenheid": "uur",
      "eenheidsprijs": 70,
      "totaal": 70
    }
  ],
  "subtotaal": 0,
  "btwPercent": ${btwTarief},
  "btwBedrag": 0,
  "totaalIncl": 0,
  "betaaltermijn": "30 dagen",
  "notities": ""
}`

  // Bericht met zowel foto als tekst
  const bericht = [
    {
      type: 'image',
      source: {
        type:       'base64',
        media_type: mimeType,
        data:       fotoBase64
      }
    },
    {
      type: 'text',
      text: tekstPrompt
    }
  ]

  const tekst = await roepClaudeAan([
    { role: 'user', content: bericht }
  ])

  const schoon = tekst.replace(/```json|```/g, '').trim()
  return JSON.parse(schoon)
}

// ── Eenvoudige conversatie (voor hulpberichten) ────────────
/**
 * Stel een eenvoudige vraag aan Claude (geen offerte)
 * @param {string} vraag - De vraag of bericht
 * @returns {string} - Het antwoord van Claude
 */
async function stelVraag(vraag) {
  const antwoord = await roepClaudeAan([
    {
      role:    'user',
      content: `Je bent een vriendelijke assistent van VakmanOfferte, een tool voor Belgische vaklieden. 
Antwoord kort en in het Nederlands.
Vraag: ${vraag}`
    }
  ])
  return antwoord
}

module.exports = {
  genereerOfferte,
  analyseerFotoEnGenereer,
  stelVraag
} 
