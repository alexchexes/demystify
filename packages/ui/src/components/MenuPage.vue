<script lang="ts" setup>
import type { PathParameterisationOptions, Representor } from "demystify-lib";
import Table from "./Table.vue";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { columns, type Column } from "./columns";
import MenuPageButtonRow from "./MenuPageButtonRow.vue";
import { Button } from "./ui/button";
import { Save, UploadCloud } from "lucide-vue-next";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "./ui/tooltip";
import Background from "./Background.vue";

defineProps<{
  representor: Representor;
  listData: Column[];
  onClickViewApi: (hostnames: string[]) => void;
  onClickSelectHar: () => void;
  onClickSave: () => void;
  onClickLoad: () => void;
  onClickReset: () => void;
  onClickHarText: (text: string) => void;
  onClickDeleteHost: (hostname: string) => void;
  parameterisationOptions: PathParameterisationOptions;
  onChangeParameterisationOptions: (
    options: PathParameterisationOptions,
  ) => void;
}>();
</script>

<template>
  <Background />
  <div class="text-ellipsis w-screen h-screen flex justify-center items-center">
    <Card class="z-10 w-[600px] h=[600px]">
      <CardHeader>
        <CardDescription>
          <div class="flex gap-2">
            <slot></slot>
            <div class="ml-auto flex gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      @click="onClickSave"
                      :disabled="listData.length === 0"
                      ><Save
                    /></Button>
                  </TooltipTrigger>
                  <TooltipContent>Save</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" @click="onClickLoad"
                      ><UploadCloud
                    /></Button>
                  </TooltipTrigger>
                  <TooltipContent>Load</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table
          :columns="columns"
          :onClickDeleteHost="onClickDeleteHost"
          :data="listData"
          class="h-[235px] h-max-[400px] overflow-scroll flex 1"
          :onClickViewApi="onClickViewApi"
        />
      </CardContent>
      <CardFooter>
        <MenuPageButtonRow
          :onClickSelectHar="onClickSelectHar"
          :onClickReset="onClickReset"
          :onClickHarText="onClickHarText"
          :parameterisationOptions="parameterisationOptions"
          :onChangeParameterisationOptions="onChangeParameterisationOptions"
        />
      </CardFooter>
    </Card>
  </div>
</template>
