/**
 * VAKMAN OFFERTE — PDF Service
 * ============================================================
 * Genereert een professionele PDF van een offerte.
 *
 * Werking:
 * 1. We bouwen een HTML string op met de offertedata
 * 2. We sturen die HTML naar Puppeteer (headless Chrome)
 * 3. Puppeteer "print" het naar een PDF bestand
 * 4. We sturen het PDF bestand terug
 * ============================================================
 */

const puppeteer = require('puppeteer')
const path      = require('path')
const fs        = require('fs')

// Map voor opgeslagen PDFs
const PDF_MAP = path.join(__dirname, '..', 'pdfs')
if (!fs.existsSync(PDF_MAP)) fs.mkdirSync(PDF_MAP)

// ── Genereer PDF ───────────────────────────────────────────
/**
 * Maak een PDF van een offerte
 * @param {Object} offerte   - Het offerte object
 * @param {Object} gebruiker - De vakman
 * @returns {string} - Pad naar het PDF bestand
 */
async function genereerPDF(offerte, gebruiker) {
  const html      = bouwOfferteHTML(offerte, gebruiker)
  const bestandsNaam = `${offerte.offerteNummer}-${Date.now()}.pdf`
  const pdfPad    = path.join(PDF_MAP, bestandsNaam)

  console.log(`📄 PDF genereren: ${bestandsNaam}`)

  // Start headless Chrome
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  const pagina = await browser.newPage()

  // Laad de HTML
  await pagina.setContent(html, { waitUntil: 'networkidle0' })

  // Genereer de PDF
  await pagina.pdf({
    path:   pdfPad,
    format: 'A4',
    margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    printBackground: true
  })

  await browser.close()

  console.log(`✅ PDF opgeslagen: ${pdfPad}`)
  return pdfPad
}

// ── Bouw de HTML op ────────────────────────────────────────
/**
 * Genereer de HTML van de offerte
 * Dit is wat de PDF eruit laat zien
 */
function bouwOfferteHTML(offerte, gebruiker) {
  const profiel = gebruiker.profiel
  const posten  = offerte.posten

  // Bouw de tabelrijen op
  const tabelRijen = posten.map(post => `
    <tr>
      <td>
        <div class="cat">${post.categorie || ''}</div>
        ${post.beschrijving}
      </td>
      <td class="r">${post.aantal}</td>
      <td>${post.eenheid}</td>
      <td class="r">€ ${(+post.eenheidsprijs).toFixed(2)}</td>
      <td class="r">€ ${(+post.totaal).toFixed(2)}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }

  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 12px;
    color: #1a1c16;
    line-height: 1.5;
  }

  /* Oranje meetlat bovenaan */
  .strip-top {
    height: 6px;
    background: repeating-linear-gradient(
      90deg,
      #f07030 0px, #f07030 10px,
      #1a1c16 10px, #1a1c16 20px
    );
  }

  .inhoud { padding: 32px; }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 32px;
    padding-bottom: 20px;
    border-bottom: 2px solid #e8e4d8;
  }

  .bedrijf-naam {
    font-size: 20px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #0e1018;
    margin-bottom: 6px;
  }

  .bedrijf-info {
    font-size: 10px;
    color: #888;
    line-height: 1.8;
    font-family: 'Courier New', monospace;
  }

  .bedrijf-info .highlight { color: #f07030; }

  .doc-titel {
    font-size: 48px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #f07030;
    line-height: 1;
    text-align: right;
  }

  .doc-meta {
    font-size: 10px;
    color: #888;
    text-align: right;
    margin-top: 6px;
    line-height: 1.8;
    font-family: 'Courier New', monospace;
  }

  .doc-meta .num { color: #1a1c16; font-weight: 600; }

  /* Klant blok */
  .klant-blok {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
  }

  .klant-kaart {
    flex: 1;
    background: #f2f0e6;
    border-radius: 6px;
    padding: 14px 16px;
    border-left: 3px solid #f07030;
  }

  .klant-label {
    font-size: 8px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #aaa;
    margin-bottom: 6px;
    font-family: 'Courier New', monospace;
  }

  .klant-naam {
    font-size: 15px;
    font-weight: 800;
    text-transform: uppercase;
    color: #1a1c16;
    margin-bottom: 3px;
  }

  .klant-info { font-size: 10px; color: #666; line-height: 1.5; }

  /* Betreft */
  .betreft {
    background: #f2f0e6;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 20px;
    font-size: 11px;
    color: #444;
    line-height: 1.5;
  }

  /* Tabel */
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }

  thead tr { background: #1a1c16; }

  th {
    padding: 8px 10px;
    font-size: 8px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #c8d8e8;
    text-align: left;
    font-weight: 500;
    font-family: 'Courier New', monospace;
  }

  th.r { text-align: right; }

  td {
    padding: 10px 10px;
    border-bottom: 0.5px solid #ede9dc;
    font-size: 11px;
    color: #333;
    vertical-align: top;
  }

  tr:nth-child(even) td { background: #faf9f4; }
  tr:last-child td { border-bottom: none; }

  td.r {
    text-align: right;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    color: #1a1c16;
  }

  .cat {
    font-size: 8px;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #f07030;
    margin-bottom: 2px;
    font-family: 'Courier New', monospace;
  }

  /* BTW uitleg */
  .btw-box {
    background: rgba(240,112,48,.06);
    border: 1px solid rgba(240,112,48,.2);
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 16px;
    font-size: 10px;
    color: #666;
    line-height: 1.6;
  }

  .btw-formule {
    font-family: 'Courier New', monospace;
    background: rgba(0,0,0,.05);
    padding: 4px 8px;
    border-radius: 3px;
    margin-top: 4px;
    font-size: 10px;
    color: #f07030;
    display: inline-block;
  }

  /* Totalen */
  .totalen-wrap {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 24px;
  }

  .totalen { width: 260px; }

  .tot-rij {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    font-size: 11px;
    color: #666;
    border-bottom: 0.5px solid #ede9dc;
  }

  .tot-rij:last-child { border-bottom: none; }
  .tot-rij.sub { color: #888; font-size: 10px; }
  .tot-rij.btw { color: #f07030; }

  .tot-rij.grand {
    background: #1a1c16;
    color: #f8f7f2;
    padding: 10px 12px;
    margin-top: 6px;
    border-radius: 4px;
    border-bottom: none;
  }

  .tot-rij.grand .lbl {
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .tot-rij.grand .val {
    font-size: 18px;
    font-weight: 900;
    color: #f07030;
    font-family: 'Courier New', monospace;
  }

  .lbl { font-weight: 500; }
  .val { font-family: 'Courier New', monospace; font-size: 11px; }

  /* Footer */
  .footer {
    border-top: 1px solid #e8e4d8;
    padding-top: 16px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 24px;
  }

  .f-lbl {
    font-size: 8px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #aaa;
    margin-bottom: 4px;
    font-family: 'Courier New', monospace;
  }

  .f-val { font-size: 10px; color: #555; line-height: 1.6; }

  .handtekening {
    margin-top: 24px;
    border-top: 0.5px solid #ddd;
    padding-top: 6px;
    font-size: 9px;
    color: #ccc;
    font-family: 'Courier New', monospace;
    display: flex;
    justify-content: space-between;
  }

  .disclaimer {
    font-size: 8px;
    color: #ccc;
    margin-top: 12px;
    font-family: 'Courier New', monospace;
    line-height: 1.5;
    border-top: 0.5px solid #eee;
    padding-top: 8px;
  }

  /* Onderste meetlat */
  .strip-bottom {
    height: 4px;
    background: repeating-linear-gradient(
      90deg,
      #f07030 0px, #f07030 8px,
      #1a1c16 8px, #1a1c16 16px
    );
    opacity: 0.3;
    margin-top: 16px;
  }
</style>
</head>
<body>

<div class="strip-top"></div>

<div class="inhoud">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="bedrijf-naam">${profiel.bedrijfsnaam || 'Jouw Bedrijf'}</div>
      <div class="bedrijf-info">
        ${profiel.btwNummer ? `BTW: <span class="highlight">${profiel.btwNummer}</span><br>` : ''}
        ${profiel.telefoon  ? `Tel: <span class="highlight">${profiel.telefoon}</span><br>` : ''}
        ${profiel.email     ? `${profiel.email}<br>` : ''}
        ${profiel.adres     ? profiel.adres : ''}
      </div>
    </div>
    <div>
      <div class="doc-titel">OFFERTE</div>
      <div class="doc-meta">
        Nr: <span class="num">${offerte.offerteNummer}</span><br>
        Datum: ${offerte.datum}<br>
        Geldig tot: ${offerte.geldigTot}
      </div>
    </div>
  </div>

  <!-- Klant -->
  <div class="klant-blok">
    <div class="klant-kaart">
      <div class="klant-label">Klant</div>
      <div class="klant-naam">${offerte.klantNaam || 'Klant'}</div>
      <div class="klant-info">
        ${offerte.klantAdres || ''}<br>
        ${offerte.klantEmail || ''}
      </div>
    </div>
    <div class="klant-kaart">
      <div class="klant-label">Werklocatie</div>
      <div class="klant-naam">${offerte.klantAdres || 'Zie klantgegevens'}</div>
      <div class="klant-info">
        BTW-tarief: ${offerte.btwPercent}% van toepassing
      </div>
    </div>
  </div>

  <!-- Betreft -->
  <div class="betreft">
    <strong>Betreft:</strong> ${offerte.omschrijvingWerk}
  </div>

  <!-- Tabel -->
  <table>
    <thead>
      <tr>
        <th style="width:40%">Omschrijving</th>
        <th class="r">Aantal</th>
        <th>Eenheid</th>
        <th class="r">Eenheidsprijs</th>
        <th class="r">Totaal</th>
      </tr>
    </thead>
    <tbody>
      ${tabelRijen}
    </tbody>
  </table>

  <!-- BTW uitleg -->
  <div class="btw-box">
    <strong>BTW ${offerte.btwPercent}%</strong> van toepassing op dit werk.
    ${offerte.btwPercent == 6 ? ' Verlaagd renovatietarief conform art. 1quinquies KB nr. 20.' : ''}
    <div class="btw-formule">
      Berekening: €${(+offerte.subtotaal).toFixed(2)} × ${offerte.btwPercent}% = €${(+offerte.btwBedrag).toFixed(2)} BTW
    </div>
  </div>

  <!-- Totalen -->
  <div class="totalen-wrap">
    <div class="totalen">
      <div class="tot-rij sub">
        <span class="lbl">Subtotaal excl. BTW</span>
        <span class="val">€ ${(+offerte.subtotaal).toFixed(2)}</span>
      </div>
      <div class="tot-rij btw">
        <span class="lbl">BTW ${offerte.btwPercent}%</span>
        <span class="val">€ ${(+offerte.btwBedrag).toFixed(2)}</span>
      </div>
      <div class="tot-rij grand">
        <span class="lbl">TOTAAL</span>
        <span class="val">€ ${(+offerte.totaalIncl).toFixed(2)}</span>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div>
      <div class="f-lbl">Betalingsvoorwaarden</div>
      <div class="f-val">
        Betaling binnen ${offerte.betaaltermijn} na factuurdatum.<br>
        ${profiel.iban ? `Rekeningnummer: ${profiel.iban}<br>` : ''}
        Mededeling: ${offerte.offerteNummer}
      </div>
    </div>
    <div>
      <div class="f-lbl">Garantie &amp; opmerkingen</div>
      <div class="f-val">
        Garantie op arbeid: 2 jaar.<br>
        Garantie op materialen: conform fabrieksgarantie.<br>
        ${offerte.notities || ''}
      </div>
    </div>
  </div>

  <div class="handtekening">
    <span>Handtekening voor akkoord klant: ___________________</span>
    <span>Datum: _______________</span>
  </div>

  <div class="disclaimer">
    Dit document werd opgesteld met behulp van VakmanOfferte AI-software. 
    De opdrachtgever is verantwoordelijk voor de controle van alle bedragen, 
    BTW-tarieven en werkbeschrijvingen voor verzending. — vakmanofferte.be
  </div>

</div>

<div class="strip-bottom"></div>

</body>
</html>`
}

module.exports = { genereerPDF } 
