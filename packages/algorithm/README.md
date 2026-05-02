# demystify-lib

Consists of a `Representor` class that accepts HAR entries and triages it. REST-esque requests are handled by the `Rest` class and property of `Representor`.

See the interface in `Representor.ts` and `Rest.ts` for usage information, along with test files.

Features:

- Real time efficient generation of documents in any format from aggregated data, of which OpenAPI 3.1 is implemented
- Automatic identification and parameterisation of path parameters
- Merges new information into existing data
- Manages multiple status codes and mime types per endpoint
- Time and space efficient, can handle an infinite number of upserted HAR entries so long as the underlying number of endpoints is finite
- Handles mime types json, x-www-form-urlencoded, and xml
- Minimal library use

## Automatic path parameterisation

Demystify can fold repeated concrete paths into OpenAPI path parameters when
the observed requests and responses look like the same endpoint.

The heuristic is conservative:

- Obvious identifier segments such as numeric IDs, UUIDs, long hex values, and
  long mixed alpha-numeric IDs can be folded after two compatible observations.
- Text segments are folded only after four compatible observations with the
  same static path shape.
- Compatible schema matching allows common variation such as `null` versus a
  populated object, scalar type changes, and optional nested branches.
- `null`, empty objects, and empty arrays are treated as unobserved inside that
  branch. Object, array, and scalar kind conflicts still block folding.
- Compatible-shape folding still needs positive observed overlap; sparse
  branches alone are not enough evidence.
- Generic empty collection wrappers such as
  `{ count, next, previous, results: [] }` do not trigger text folding by
  themselves.
- Incompatible sibling routes stay concrete.
- Existing dynamic ID paths do not accept later non-ID segments. For example,
  `/clients/{client}` learned from numeric IDs will not absorb
  `/clients/search`.

Parameterisation can be configured when constructing a `Representor`:

```typescript
import { Representor } from "demystify-lib";

const representor = new Representor({
  parameterisation: {
    enabled: true,
    foldStrongIds: true,
    foldText: true,
    compatibleShape: true,
  },
});
```

Options:

- `enabled`: turns automatic path parameterisation on or off.
- `foldStrongIds`: folds ID-like path values.
- `foldText`: folds non-ID text path values after enough compatible examples.
- `compatibleShape`: allows structurally compatible, non-identical schemas.
  When disabled, exact schema equality is required, while text-route safety
  checks still apply.

The CLI exposes the common modes:

```shell
demystify --input ./example.har --parameterisation safe-text
demystify --input ./example.har --parameterisation id-only
demystify --input ./example.har --parameterisation off
```

The shared UI exposes the same options as checkboxes.

Changing parameterisation options in the UI can reprocess HAR data imported
during the current session. Saved Demystify projects keep their existing
generated paths when loaded again; changed options apply to future HAR imports.

Demystify does not retroactively split a folded path. If a later compatible
observation matches an existing dynamic path, it can be merged into that path.
When Demystify is uncertain, it keeps routes concrete rather than folding them.

## Security generation

Auth-looking request headers and cookies are emitted as OpenAPI security schemes
and operation security requirements. They are not emitted as ordinary operation
parameters, because they describe credentials rather than endpoint inputs.
When multiple credentials are observed on the same request, each is emitted as a
separate alternative because HAR data cannot prove which credential is actually
required by the server. Observed `Authorization` headers are emitted both as
Bearer auth and as a generic API-key header option.

```typescript
import { Representor } from "demystify-lib";
// Instantiate the representor
// Which "represents" an API in a particular way, such as OpenAPI or GraphQL
const representor = new Representor();
// Call upsert with a valid HAR entry to add it to the representor
// Repeat as many times as desired
representor.upsert(/* harEntry */);
// Call generate on the rest property of representor to generate OpenAPI documents
representor.rest.generate();
```
