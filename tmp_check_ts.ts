import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const TS = createRequire(import.meta.url)("typescript");
const cwd = process.cwd();
const projectRoot = cwd;

async function main() {
  const tsconfig = resolve(projectRoot, "tsconfig.app.json");
  try {
    await access(tsconfig, constants.F_OK);
  } catch {
    console.error("tsconfig.app.json not found at", tsconfig);
    process.exit(2);
  }
  const raw = TS.readConfigFile(tsconfig, TS.sys.readFile);
  if (raw.error) {
    console.error("read config error:", raw.error.message);
    process.exit(2);
  }
  const parsed = TS.parseJsonConfigFileContent(
    raw.config,
    TS.sys,
    projectRoot,
    { noEmit: true },
    tsconfig,
  );
  if (parsed.errors.length > 0) {
    const text = TS.formatDiagnosticsWithColorAndContext(
      parsed.errors,
      {
        getCurrentDirectory: () => projectRoot,
        getCanonicalFileName: (f) => f,
        getNewLine: () => "\n",
      },
    );
    console.error(text);
    process.exit(2);
  }
  console.log("config parsed ok; files:", parsed.fileNames.length);
  const program = TS.createProgram(parsed.fileNames, parsed.options);
  const emitResult = program.emit();
  const allDiagnostics = [
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics(),
    ...emitResult.diagnostics,
  ];
  if (allDiagnostics.length === 0) {
    console.log("No type errors.");
    process.exit(0);
  }
  const text = TS.formatDiagnosticsWithColorAndContext(
    allDiagnostics,
    {
      getCurrentDirectory: () => projectRoot,
      getCanonicalFileName: (f) => f,
      getNewLine: () => "\n",
    },
  );
  console.log(text);
  process.exit(2);
}

main().catch((e) => {
  console.error("internal error:", e);
  process.exit(2);
});
