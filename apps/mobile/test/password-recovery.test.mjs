import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL("../src/utils/password-recovery.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { readPasswordRecoveryLink } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
test("password recovery reads fragment links from web and native without confusing sales or query parameters", () => {
  const token = "a".repeat(43);
  for (const base of [
    "https://app.test/reset-password",
    "http://localhost:8081/reset-password/",
    "nacional://reset-password",
    "nacional://reset-password/",
  ]) {
    assert.deepEqual(
      readPasswordRecoveryLink(`${base}#token=${token}&portal=admin`),
      { token, portal: "ADMIN" },
    );
    assert.deepEqual(
      readPasswordRecoveryLink(`${base}#token=${token}&portal=app`),
      { token, portal: "APP" },
    );
  }
  for (const url of [
    null,
    undefined,
    "invalid",
    `https://app.test/other#token=${token}`,
    `nacional://sale/abc#token=${token}`,
    `https://app.test/reset-password?token=${token}`,
    `https://app.test/reset-password#token=${"a".repeat(300)}`,
    `ftp://app.test/reset-password#token=${token}`,
  ])
    assert.equal(readPasswordRecoveryLink(url), null);
});
