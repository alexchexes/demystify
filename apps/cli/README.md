# demystify

This command reads a HTTP Archive file (HAR) and writes OpenAPI 3.1 specifications to the current working directory.

```sh
npx demystify --input <somefile.har>
```

For more information see the [demystify](https://github.com/AndrewWalsh/demystify) repository.

```
Usage: demystify [options]

Example: demystify --input ./example.har

Options:
  -h, --help                 Show help information
  -i, --input  <string>      A path to a HTTP Archive file (HAR)
  -p, --parameterisation <string>
                              Path folding mode: safe-text, id-only, or off
  -s, --stdout <boolean>     Optional: when "true", write a JSON array to stdout instead of writing files

This command writes OpenAPI 3.1 specifications to the current directory
Names of these files follow the convention {host}.{type}.json

Example host: api.example.com
Example type: openapi
```
