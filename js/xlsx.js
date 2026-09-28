import { computeEntry, dateFromKey, formatDuration, typeRule, TYPE_LABELS } from "./time.js?v=1.1.0";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function xml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function excelDate1904(key) {
  const date = dateFromKey(key);
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return (utc - Date.UTC(1904, 0, 1)) / 86400000;
}

function excelTime(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  return (date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60) / 1440;
}

function cellXml(value, row, column, forcedStyle = null) {
  const reference = `${columnName(column)}${row}`;
  const styleAttribute = forcedStyle === null ? "" : ` s="${forcedStyle}"`;
  if (value === null || value === undefined || value === "") return `<c r="${reference}"${styleAttribute}/>`;
  if (typeof value === "object" && value.kind === "number") {
    return `<c r="${reference}" s="${value.style || 0}"><v>${Number(value.value)}</v></c>`;
  }
  if (typeof value === "number") return `<c r="${reference}"${styleAttribute}><v>${value}</v></c>`;
  return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function sheetXml(rows, widths, autoFilter = true) {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const rowXml = rows
    .map((row, index) => {
      const cells = row.map((value, column) => cellXml(value, index + 1, column, index === 0 ? 1 : null)).join("");
      const style = index === 0 ? ' s="1" customFormat="1" ht="24" customHeight="1"' : "";
      return `<row r="${index + 1}"${style}>${cells}</row>`;
    })
    .join("");
  const columns = widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const lastCell = `${columnName(columnCount - 1)}${Math.max(rows.length, 1)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCell}"/>
  <sheetViews><sheetView workbookViewId="0" zoomScale="100" zoomScaleNormal="100"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${columns}</cols>
  <sheetData>${rowXml}</sheetData>
  ${autoFilter ? `<autoFilter ref="A1:${lastCell}"/>` : ""}
</worksheet>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="5">
    <numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>
    <numFmt numFmtId="165" formatCode="hh:mm"/>
    <numFmt numFmtId="166" formatCode="[h]:mm"/>
    <numFmt numFmtId="167" formatCode="[Green]+[h]:mm;[Red]-[h]:mm;00:00"/>
    <numFmt numFmtId="168" formatCode="0%"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="11"/><name val="Aptos"/><family val="2"/><color rgb="FF17324D"/></font>
    <font><b/><sz val="11"/><name val="Aptos Display"/><family val="2"/><color rgb="FFFFFFFF"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF17324D"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD8E0E7"/></left><right style="thin"><color rgb="FFD8E0E7"/></right><top style="thin"><color rgb="FFD8E0E7"/></top><bottom style="thin"><color rgb="FFD8E0E7"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="168" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function number(value, style = 0) {
  return { kind: "number", value, style };
}

function journalRows(entries, settings) {
  const headers = ["Date", "Jour", "Type", "Heure arrivée", "Heure départ", "Pause", "Temps réel", "Bonification", "Temps comptabilisé", "Temps prévu", "Écart", "Règle", "Commentaire"];
  const formatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });
  return [
    headers,
    ...entries.map((entry) => {
      const calculated = computeEntry(entry, entry.departure ? new Date(entry.departure) : new Date(), settings);
      const rule = typeRule(settings, entry.type);
      const ruleText = `x${rule.coefficient}${rule.fixedMinutes ? ` ${formatDuration(rule.fixedMinutes, { signed: true })}` : ""}${calculated.calendarMultiplier !== 1 ? ` · date x${calculated.calendarMultiplier}` : ""}`;
      return [
        number(excelDate1904(entry.date), 2),
        formatter.format(dateFromKey(entry.date)),
        TYPE_LABELS[entry.type] || "Autre",
        entry.arrival ? number(excelTime(entry.arrival), 3) : null,
        entry.departure ? number(excelTime(entry.departure), 3) : null,
        number(Number(entry.pauseMinutes || 0) / 1440, 4),
        number(calculated.workedMinutes / 1440, 4),
        number(calculated.bonusMinutes / 1440, 5),
        number(calculated.countedMinutes / 1440, 5),
        number(calculated.plannedMinutes / 1440, 4),
        number(calculated.gapMinutes / 1440, 5),
        ruleText,
        entry.comment || "",
      ];
    }),
  ];
}

function monthlyRows(entries, settings, year) {
  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const totals = Array.from({ length: 12 }, () => ({ worked: 0, counted: 0, planned: 0 }));
  for (const entry of entries) {
    const values = computeEntry(entry, entry.departure ? new Date(entry.departure) : new Date(), settings);
    const month = Number(entry.date.slice(5, 7)) - 1;
    totals[month].worked += values.workedMinutes;
    totals[month].counted += values.countedMinutes;
    totals[month].planned += values.plannedMinutes;
  }
  return [
    ["Mois", "Temps réel", "Temps comptabilisé", "Temps prévu", "Écart comptabilisé / prévu"],
    ...totals.map((total, month) => [
      `${monthNames[month]} ${year}`,
      number(total.worked / 1440, 4),
      number(total.counted / 1440, 5),
      number(total.planned / 1440, 4),
      number((total.counted - total.planned) / 1440, 5),
    ]),
  ];
}

function annualRows(entries, settings, year) {
  const totals = entries.reduce(
    (result, entry) => {
      const values = computeEntry(entry, entry.departure ? new Date(entry.departure) : new Date(), settings);
      result.worked += values.workedMinutes;
      result.counted += values.countedMinutes;
      result.planned += values.plannedMinutes;
      return result;
    },
    { worked: 0, counted: 0, planned: 0 },
  );
  const target = Number(settings.annualTargetMinutes || 0);
  return [
    ["Indicateur", "Valeur"],
    ["Année", year],
    ["Objectif annuel", number(target / 1440, 4)],
    ["Heures réalisées", number(totals.worked / 1440, 4)],
    ["Heures comptabilisées", number(totals.counted / 1440, 5)],
    ["Heures prévues", number(totals.planned / 1440, 4)],
    ["Écart comptabilisé / prévu", number((totals.counted - totals.planned) / 1440, 5)],
    ["Reste à atteindre", number(Math.max(0, target - totals.counted) / 1440, 4)],
    ["Pourcentage comptabilisé", number(target ? totals.counted / target : 0, 6)],
  ];
}

function settingsRows(settings) {
  const pauseLabels = { none: "Aucune", fixed: "Durée fixe", manual: "Saisie manuelle" };
  const rows = [
    ["Paramètre", "Valeur"],
    ["Durée habituelle d’une journée", number(Number(settings.standardDayMinutes || 0) / 1440, 4)],
    ["Objectif annuel", number(Number(settings.annualTargetMinutes || 0) / 1440, 4)],
    ["Gestion des pauses", pauseLabels[settings.pauseMode] || "Aucune"],
    ["Pause fixe", number(Number(settings.fixedPauseMinutes || 0) / 1440, 4)],
    ["Premier jour de la semaine", Number(settings.weekStartsOn) === 0 ? "Dimanche" : "Lundi"],
    ["Format horaire", settings.hour12 ? "12 heures" : "24 heures"],
    ["Coefficient dimanche", Number(settings.sundayMultiplier ?? 2)],
    ["Coefficient jour férié", Number(settings.holidayMultiplier ?? 2)],
    ["Export généré le", new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date())],
  ];
  for (const [type, label] of Object.entries(TYPE_LABELS)) {
    const rule = typeRule(settings, type);
    rows.push([`Type ${label}`, `Coefficient x${rule.coefficient} · forfait ${formatDuration(rule.fixedMinutes, { signed: true })}`]);
  }
  return rows;
}

export async function buildExcelBlob(allEntries, settings, year = new Date().getFullYear()) {
  if (!globalThis.JSZip) throw new Error("Le composant Excel n’est pas disponible.");
  const entries = allEntries.filter((entry) => Number(entry.date.slice(0, 4)) === year);
  const sheets = [
    { name: "JOURNAL", rows: journalRows(entries, settings), widths: [13, 14, 22, 15, 15, 12, 16, 16, 20, 16, 16, 24, 42] },
    { name: "MENSUEL", rows: monthlyRows(entries, settings, year), widths: [20, 18, 22, 18, 28] },
    { name: "ANNUEL", rows: annualRows(entries, settings, year), widths: [30, 22] },
    { name: "PARAMÈTRES", rows: settingsRows(settings), widths: [38, 28] },
  ];

  const zip = new globalThis.JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n  ")}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <workbookPr date1904="1"/>
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>
  <sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets>
  <calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("\n  ")}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file("xl/styles.xml", stylesXml());
  sheets.forEach((sheet, index) => zip.file(`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet.rows, sheet.widths)));
  const timestamp = new Date().toISOString();
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Suivi des heures ${year}</dc:title><dc:creator>Suivi des heures</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
</cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Suivi des heures</Application><Company></Company></Properties>`);
  return zip.generateAsync({ type: "blob", mimeType: MIME_XLSX, compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function workbookSummary(entries, settings, year) {
  const filtered = entries.filter((entry) => Number(entry.date.slice(0, 4)) === year);
  const total = filtered.reduce((sum, entry) => sum + computeEntry(entry, new Date(), settings).countedMinutes, 0);
  return `${filtered.length} journées, ${formatDuration(total)} comptabilisées, objectif ${formatDuration(settings.annualTargetMinutes)}.`;
}
