<script lang="ts" setup>
import { ref, defineProps, watch } from "vue";
import type { HarEntry, PathParameterisationOptions } from "demystify-lib";
import { defaultPathParameterisationOptions, Representor } from "demystify-lib";
import { debounce } from "lodash";
import "../index.css";
import MenuPage from "./MenuPage.vue";
import type { OpenApiBuilder } from "openapi3-ts/oas31";
import type { Column } from "./columns";
import ApiSpecRenderer from "./ApiSpecRenderer.vue";
import type { Har } from "har-format";
import { useToast } from "./ui/toast/use-toast";
import { loadSave, writeTextToFile } from "@demystify/helpers";

export type OpenApiBuilder31 = OpenApiBuilder;

const { toast } = useToast();

const props = defineProps<{
  har: HarEntry[];
  disableApiRequests?: boolean;
  onClickSelectHar: () => Promise<void>;
  onClickSave?: (str: string) => void;
  readFromFile?: () => Promise<string>;
  onLoadedSpec?: (rep: Representor) => (hostnames: Array<string>) => void;
}>();

type MenuPageData = { representor: Representor; items: Column[] };
type OpenApiPageData = { builder: OpenApiBuilder31; hostnames: string[] };

interface Page {
  name: "menu" | "openapi";
  data: MenuPageData | OpenApiPageData;
}

interface MenuPage extends Page {
  name: "menu";
  data: MenuPageData;
}

interface OpenAPIPage extends Page {
  name: "openapi";
  data: OpenApiPageData;
}

const parameterisationOptions = ref<PathParameterisationOptions>({
  ...defaultPathParameterisationOptions,
});
const createRepresentor = () =>
  new Representor({ parameterisation: parameterisationOptions.value });
const representor = ref<Representor>(createRepresentor());
const replayableHar = ref<HarEntry[]>([]);
const currentPage = ref<Page>({
  name: "menu",
  data: { representor: representor.value, items: [] },
});
const isMenuPage = (page: Page): page is MenuPage => page.name === "menu";
const isOpenAPIPage = (page: Page): page is OpenAPIPage =>
  page.name === "openapi";
const updateMenuPage = () => {
  const names = representor.value.rest.getNames();
  names.sort();
  currentPage.value = {
    name: "menu",
    data: {
      representor: representor.value,
      items: names.map((name) => ({
        name,
        kind: "OpenAPI" as const,
      })),
    },
  };
};
const updateOpenAPIPage = (hostnames: string[]) => {
  currentPage.value = {
    name: "openapi",
    data: { builder: representor.value.rest.generate(hostnames), hostnames },
  };
};

const debouncedUpdate = debounce(() => {
  if (isMenuPage(currentPage.value)) {
    updateMenuPage();
  } else if (isOpenAPIPage(currentPage.value)) {
    updateOpenAPIPage(currentPage.value.data.hostnames);
  }
}, 500);

const upsertEntry = (entry: HarEntry, replayable: boolean): boolean => {
  const wasUpsert = representor.value.upsert(entry);
  if (wasUpsert && replayable) {
    replayableHar.value.push(entry);
  }
  return wasUpsert;
};

const rebuildRepresentor = () => {
  // UI toggles can rebuild only from HAR entries captured or loaded in this
  // session. Serialized Demystify saves contain the already-built IR tree.
  const entries = [...replayableHar.value];
  representor.value = createRepresentor();
  for (const entry of entries) {
    representor.value.upsert(entry);
  }
  if (isMenuPage(currentPage.value)) {
    updateMenuPage();
  } else if (isOpenAPIPage(currentPage.value)) {
    updateOpenAPIPage(currentPage.value.data.hostnames);
  }
};

const onChangeParameterisationOptions = (
  options: PathParameterisationOptions,
) => {
  parameterisationOptions.value = options;
  if (replayableHar.value.length) {
    rebuildRepresentor();
    return;
  }
  representor.value.rest.setParameterisationOptions(options);
};

watch(
  () => props.har,
  (har) => {
    if (har.length) {
      try {
        for (const entry of har) {
          const wasUpsert = upsertEntry(entry, true);
          if (wasUpsert) {
            debouncedUpdate();
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  },
);

const onClickViewApi = (hostnames: string[]) => {
  updateOpenAPIPage(hostnames);
};

const tryToLoadHarText = (text: string) => {
  try {
    const har = JSON.parse(text) as Har;
    let count = 0;
    for (const entry of har.log.entries) {
      const wasUpsert = upsertEntry(entry, true);
      if (wasUpsert) {
        count++;
      }
    }
    toast({
      title: "Pasted HAR",
      description: `Loaded ${count} entries`,
      duration: 2000,
    });
    updateMenuPage();
  } catch (e) {
    toast({
      title: "Error Loading HAR",
      description: e instanceof Error ? e.message : "An unknown error occurred",
      duration: 5000,
    });
  }
};

const onClickReset = () => {
  replayableHar.value = [];
  representor.value = createRepresentor();
  updateMenuPage();
};

const boundOnClickSave = () => {
  const output = representor.value.serialise();
  if (output) {
    if (props.onClickSave) {
      props.onClickSave(output);
    } else {
      writeTextToFile(output);
    }
  }
};

const boundOnClickSelectHar = async () => {
  await props.onClickSelectHar();
  updateMenuPage();
};

const boundOnClickLoad = async () => {
  try {
    const save = (await props.readFromFile?.()) || (await loadSave());
    const successful = representor.value.deserialise(save as string);
    if (!successful) {
      throw new Error("Failed to load save");
    }
    replayableHar.value = [];
    updateMenuPage();
    toast({
      title: "Load Successful",
      description: "Successfully loaded save",
      duration: 2000,
    });
    return;
  } catch (e: any) {
    console.log(e.message);
    // The error below happens every time the user closes the file dialog without a selection
    if (e.message.startsWith("Error calling method: open : no such file or directory")) {
      return;
    }
    toast({
      title: "Load Failed",
      description: "Failed to load save",
      duration: 5000,
    });
  }
};

const onClickDeleteHost = (hostname: string) => {
  representor.value.rest.deleteName(hostname);
  updateMenuPage();
};
</script>

<template>
  <MenuPage
    v-if="isMenuPage(currentPage)"
    :representor="currentPage.data.representor"
    :list-data="currentPage.data.items"
    :onClickViewApi="onClickViewApi"
    :onClickSelectHar="boundOnClickSelectHar"
    :onClickSave="boundOnClickSave"
    :onClickLoad="boundOnClickLoad"
    :onClickReset="onClickReset"
    :onClickHarText="tryToLoadHarText"
    :onClickDeleteHost="onClickDeleteHost"
    :parameterisationOptions="parameterisationOptions"
    :onChangeParameterisationOptions="onChangeParameterisationOptions"
  >
    <slot></slot>
  </MenuPage>
  <ApiSpecRenderer
    v-if="isOpenAPIPage(currentPage)"
    :spec="currentPage.data.builder.getSpec()"
    :onClickBack="() => updateMenuPage()"
    :disableApiRequests="!!disableApiRequests"
    :onLoadedSpec="
      () => {
        if (currentPage.name === 'openapi') {
          const openapiPage = currentPage as OpenAPIPage;
          props.onLoadedSpec?.(representor)(openapiPage.data.hostnames);
        }
      }
    "
  />
</template>
