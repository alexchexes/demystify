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
