import { HostToNode, Manager } from "./types/index.js";
import { ValidHar } from "./har-to-hartype/index.js";
import { updateOrCreate } from "./update-or-create/update-or-create.js";
import { generateOai31 } from "./generate/index.js";
import { OpenApiBuilder } from "openapi3-ts/oas31";
import { pick } from "lodash";
import { serialiseRest } from "./utils/index.js";
import { automaticParameterisation } from "./parameterisation/automatic-parameterisation.js";
import {
  PathParameterisationOptions,
  resolvePathParameterisationOptions,
} from "./parameterisation/parameterisation-options.js";

type Data = HostToNode;
type Output = OpenApiBuilder;

export class RestManager extends Manager<Data, Output> {
  data: Data;
  parameterisationOptions: PathParameterisationOptions;
  constructor(options: Partial<PathParameterisationOptions> = {}) {
    super();
    this.data = {};
    this.parameterisationOptions = resolvePathParameterisationOptions(options);
  }

  setParameterisationOptions = (
    options: Partial<PathParameterisationOptions>,
  ): void => {
    this.parameterisationOptions = resolvePathParameterisationOptions(options);
  };

  upsert = (data: ValidHar): void => {
    const url = new URL(data.har.request.url);
    const host = url.host;
    const rootNode = this.data[host] || null;
    const { root, inserted } = updateOrCreate({
      data,
      options: this.parameterisationOptions,
      rootNode,
    });
    this.data[host] = root;
    automaticParameterisation({
      pathname: url.pathname.split("/").filter((part) => part.length > 0),
      insertedNode: inserted,
      rootNode: root,
      method: data.har.request.method,
      mimeType: data.har.response.content.mimeType,
      statusCode: data.har.response.status.toString(),
      options: this.parameterisationOptions,
    });
  };

  generate = (hosts: string[] = []): OpenApiBuilder => {
    if (hosts.length) {
      const selectedhosts = generateOai31(pick(this.data, hosts));
      return selectedhosts;
    } else {
      const allHost = generateOai31(this.data);
      return allHost;
    }
  };

  getNames = (): string[] => {
    return Object.keys(this.data);
  };

  reset = (): void => {
    this.data = {};
  };

  serialise = (): string | null => {
    return serialiseRest(this.data);
  };

  deserialise = (input: string): boolean => {
    try {
      this.data = JSON.parse(input);
      return true;
    } catch {
      return false;
    }
  };

  deleteName(name: string): boolean {
    if (this.data[name]) {
      delete this.data[name];
      return true;
    }
    return false;
  }
}
