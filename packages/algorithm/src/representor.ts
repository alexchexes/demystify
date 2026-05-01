import { RestManager } from "./rest.js";
import { HarEntry } from "./types/index.js";
import { harToHarType } from "./har-to-hartype/index.js";
import stringify from "json-stable-stringify";
import { formatHar } from "./utils/index.js";
import { PathParameterisationOptions } from "./parameterisation/parameterisation-options.js";

type RepresentorOptions = {
  parameterisation?: Partial<PathParameterisationOptions>;
};

/**
 * Delegate HAR entries to different representations
 */
export class Representor {
  rest: RestManager;
  constructor(options: RepresentorOptions = {}) {
    this.rest = new RestManager(options.parameterisation);
  }

  /**
   * Returns true if the har is a known type and was upserted else false
   */
  upsert = (har: HarEntry): boolean => {
    const knownHar = harToHarType(formatHar(har));
    if (!knownHar) return false;
    if (knownHar.kind === "rest-json" || knownHar.kind === "rest-xml") {
      this.rest.upsert(knownHar);
      return true;
    }
    if (knownHar.kind === "graphql") {
      // this.graphql.upsert(knownHar.har);
    }
    if (knownHar.kind === "grpc-web") {
      // console.log("gRPC-Web not supported yet");
    }
    return false;
  };

  reset = (): void => {
    this.rest.reset();
  };

  serialise = (): string => {
    return (
      stringify({
        rest: this.rest.serialise(),
      }) || ""
    );
  };

  deserialise = (input: string): boolean => {
    try {
      const parsed = JSON.parse(input);
      if (parsed.rest) {
        return this.rest.deserialise(parsed.rest);
      }
      return false;
    } catch {
      return false;
    }
  };
}
