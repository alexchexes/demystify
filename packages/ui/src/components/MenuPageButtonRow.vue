<script lang="ts" setup>
import { ref } from "vue";
import type { PathParameterisationOptions } from "demystify-lib";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Textarea } from "./ui/textarea";

const props = defineProps<{
  onClickSelectHar: () => void;
  onClickReset: () => void;
  onClickHarText: (text: string) => void;
  parameterisationOptions: PathParameterisationOptions;
  onChangeParameterisationOptions: (
    options: PathParameterisationOptions,
  ) => void;
}>();

const showModal = ref(false);
const textareaContent = ref("");

const clearTextArea = () => {
  textareaContent.value = "";
};

const handleLoadText = () => {
  showModal.value = false;
  if (!textareaContent.value) {
    return;
  }
  props.onClickHarText(textareaContent.value);
};

const handleCancel = () => {
  showModal.value = false;
  textareaContent.value = "";
};
const updateParameterisationOption = (
  key: keyof PathParameterisationOptions,
  event: Event,
) => {
  const target = event.target as HTMLInputElement;
  props.onChangeParameterisationOptions({
    ...props.parameterisationOptions,
    [key]: target.checked,
  });
};
const textAreaPlaceholder = `{ "log": { "entries": ... } }

To copy a HAR in the network tab of modern browsers, right click on a request, click copy, then copy as HAR.`;
</script>

<template>
  <div class="flex-1 flex gap-4 flex-col">
    <div class="flex gap-3 w-full flex-wrap text-sm">
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="parameterisationOptions.enabled"
          @change="updateParameterisationOption('enabled', $event)"
        />
        Auto-fold
      </label>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="parameterisationOptions.foldStrongIds"
          :disabled="!parameterisationOptions.enabled"
          @change="updateParameterisationOption('foldStrongIds', $event)"
        />
        IDs
      </label>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="parameterisationOptions.foldText"
          :disabled="!parameterisationOptions.enabled"
          @change="updateParameterisationOption('foldText', $event)"
        />
        Text
      </label>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="parameterisationOptions.compatibleShape"
          :disabled="!parameterisationOptions.enabled"
          @change="updateParameterisationOption('compatibleShape', $event)"
        />
        Shape
      </label>
    </div>
    <div class="flex gap-2 w-full">
      <Button @click="onClickSelectHar">Select HAR</Button>
      <Button @click="showModal = true">Paste HAR</Button>
      <Button class="ml-auto" @click="onClickReset" variant="destructive"
        >Reset</Button
      >
    </div>
  </div>
  <Dialog v-model:open="showModal">
    <DialogContent class="p-4" @close-auto-focus="clearTextArea">
      <DialogHeader>
        <DialogTitle>Paste HAR</DialogTitle>
      </DialogHeader>
      <Textarea
        v-model="textareaContent"
        :placeholder="textAreaPlaceholder"
        class="w-full h-36 mb-4"
        @keydown.enter.prevent="handleLoadText"
      />
      <div class="flex justify-between">
        <Button variant="secondary" @click="handleCancel">Cancel</Button>
        <Button @click="handleLoadText" :disabled="!textareaContent">Save</Button
        >
      </div>
    </DialogContent>
  </Dialog>
</template>
