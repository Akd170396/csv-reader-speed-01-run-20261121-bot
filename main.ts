import { setFlagsFromString } from "node:v8";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

setFlagsFromString("--no-incremental-marking");

const { run } = await import("./solve.js");

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

const cases = JSON.parse(readFileSync(join(inputDir, "cases.json"), "utf8"));
// Stringify each answer as soon as it is computed so the (large) result
// object can be collected before the next case runs.
const chunks = new Array(cases.length);
for (let k = 0; k < cases.length; k++) {
  chunks[k] = JSON.stringify(run(cases[k].input));
}
writeFileSync(join(outputDir, "answers.json"), "[" + chunks.join(",") + "]");
