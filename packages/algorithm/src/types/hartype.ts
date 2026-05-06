import { HarEntry } from "./index.js";

// Entries that appear to be API requests
export type HarRestJson = HarEntry
export type HarRestXml = HarEntry
export type HarGraphQL = HarEntry
export type HarGrpcWeb = HarEntry

export type HarAny = HarRestJson | HarRestXml | HarGraphQL | HarGrpcWeb
export type HarRestful = HarRestJson | HarRestXml
