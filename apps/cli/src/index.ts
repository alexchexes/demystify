#!/usr/bin/env node

import { parseArgs } from "node:util";
import * as fs from "node:fs";
import {
  HarEntry,
  isPathParameterisationMode,
  pathParameterisationOptionsFromMode,
  Representor,
} from "demystify-lib";

const fileExists = async (path: string) => {
  try {
    await fs.promises.access(path);
    return true;
  } catch {
    return false;
  }
};

async function main() {
  const { values } = parseArgs({
    options: {
      help: {
        type: "boolean",
        short: "h",
      },
      input: {
        type: "string",
        short: "i",
      },
      stdout: {
        type: "boolean",
        short: "s",
      },
      parameterisation: {
        type: "string",
        short: "p",
      },
    },
  });

  if (values.help) {
    console.log(`
Usage: demystify [options]

Example: demystify --input ./example.har

Options:
  -h, --help                 Show help information
  -i, --input  <string>      A path to a HTTP Archive file (HAR)
  -s, --stdout <boolean>     Optional: when "true", write a JSON array to stdout instead of writing files
  -p, --parameterisation <string>
                              Path folding mode: safe-text, id-only, or off

This command writes OpenAPI 3.1 specifications to the current directory
Names of these files follow the convention {hostname}.{type}.json

Example hostname: api.example.com
Example type: openapi
`);
    process.exit(0);
  }
  if (!values.input || !(await fileExists(values.input))) {
    console.error(
      "The --input [name.har] flag is required and must be a valid HAR file",
    );
    process.exit(1);
  }
  const parameterisationMode = values.parameterisation || "safe-text";
  if (!isPathParameterisationMode(parameterisationMode)) {
    console.error(
      "The --parameterisation flag must be one of: safe-text, id-only, off",
    );
    process.exit(1);
  }

  const representor = new Representor({
    parameterisation: pathParameterisationOptionsFromMode(parameterisationMode),
  });
  try {
    const inputHar = await fs.promises.readFile(values.input, "utf-8");
    const entries = JSON.parse(inputHar).log.entries as HarEntry[];
    try {
      for (const entry of entries) {
        representor.upsert(entry);
      }
    } catch {
      console.error("Failed to upsert one or more HAR entries");
      process.exit(1);
    }
  } catch {
    console.error(
      'Could not parse the HAR file. It should be JSON, beginning with { "log": ... }',
    );
    process.exit(1);
  }

  const restNames = representor.rest.getNames();
  const output = [];
  for (const name of restNames) {
    const spec = representor.rest.generate([name]).getSpecAsJson();
    const pretty = JSON.stringify(JSON.parse(spec), null, 2);
    if (values.stdout) {
      output.push(pretty);
    } else {
      await fs.promises.writeFile(`${name}.openapi.json`, pretty);
    }
  }
  if (output.length) {
    console.log(`[${output.join(",\n")}]`);
  }
}

main().catch(console.error);
