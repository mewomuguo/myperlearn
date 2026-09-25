import fs from "node:fs/promises";
import ts from "typescript";
import { z } from "zod";
const source = await fs.readFile(
  new URL("../src/importer.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const temp = new URL("./.importer-runtime.mjs", import.meta.url);
try {
  await fs.writeFile(temp, output);
  const { recordSchema } = await import(temp.href);
  await fs.writeFile(
    new URL("../docs/record-export.schema.json", import.meta.url),
    JSON.stringify(z.toJSONSchema(recordSchema), null, 2) + "\n",
  );
  console.log("Runtime record schema exported.");
} finally {
  await fs.rm(temp, { force: true });
}
