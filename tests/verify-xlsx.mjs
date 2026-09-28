import fs from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const workbookPath = process.argv[2];
const toolPath = process.env.ARTIFACT_TOOL_PATH;
if (!workbookPath || !toolPath) throw new Error("Usage: ARTIFACT_TOOL_PATH=... node tests/verify-xlsx.mjs workbook.xlsx");

const { FileBlob, SpreadsheetFile } = await import(pathToFileURL(toolPath));
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const output = join(dirname(workbookPath), "xlsx-previews");
await fs.mkdir(output, { recursive: true });

const overview = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 6000 });
const journal = await workbook.inspect({ kind: "table", range: "JOURNAL!A1:J3", include: "values,formulas", tableMaxRows: 3, tableMaxCols: 10, maxChars: 10000 });
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});

const renderRanges = { JOURNAL: "A1:J3", MENSUEL: "A1:D13", ANNUEL: "A1:B8", PARAMÈTRES: "A1:B8" };
for (const [sheetName, range] of Object.entries(renderRanges)) {
  const image = await workbook.render({ sheetName, range, scale: 1.5, format: "png" });
  await fs.writeFile(join(output, `${sheetName.toLowerCase()}.png`), new Uint8Array(await image.arrayBuffer()));
}

console.log(JSON.stringify({
  file: basename(workbookPath),
  overview: overview.ndjson,
  journal: journal.ndjson,
  errors: errors.ndjson,
}, null, 2));
