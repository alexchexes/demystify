import { describe, it, expect, afterEach } from "vitest";
import { Validator } from "@seriousme/openapi-schema-validator";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync, rmSync } from "node:fs";

const inputHar = resolve(__dirname, "./rest_post.json");
const builtFile = resolve(__dirname, "../dist/index.js");
const callFile = (stdout?: "-s" | "--stdout") => {
  const stdOutStr = stdout || "";
  return execSync(`node ${builtFile} --input ${inputHar} ${stdOutStr}`, {
    encoding: "utf-8",
  });
};

const hostnameOne = "one.com";
const hostnameTwo = "two.com";

const deleteAllFiles = () => {
  const cwd = process.cwd();
  rmSync(`${cwd}/${hostnameOne}.openapi.json`, { force: true });
  rmSync(`${cwd}/${hostnameTwo}.openapi.json`, { force: true });
};

const readAllFiles = (filenames: string[]): string[] => {
  const cwd = process.cwd();
  const out: string[] = [];
  for (const filename of filenames) {
    const content = readFileSync(`${cwd}/${filename}.openapi.json`, "utf-8");
    out.push(content);
  }
  return out;
};

describe("CLI", () => {
  afterEach(() => {
    deleteAllFiles();
  });

  it("produces valid openapi files", async () => {
    callFile();
    const jsonArr = readAllFiles([hostnameOne, hostnameTwo]);
    for (const json of jsonArr) {
      const obj = JSON.parse(json);
      expect(await new Validator().validate(obj)).toEqual({ valid: true });
    }
  });

  it("when -s or --stdout is specified, outputs valid openapi json", async () => {
    const flags = ["-s", "--stdout"] as const;
    for (const flag of flags) {
      const stdout = callFile(flag);
      const stdoutStr = stdout.toString();
      const jsonArr = JSON.parse(stdoutStr);
      // console.log(stdoutStr)
      for (const json of jsonArr) {
        expect(await new Validator().validate(json)).toEqual({ valid: true });
      }
    }
  });
});
