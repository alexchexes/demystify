import type { Updater } from "@tanstack/vue-table";
import type { Ref } from "vue";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function valueUpdater<T>(updaterOrValue: Updater<T>, ref: Ref<T>) {
  type UpdaterFn = (old: T) => T;
  ref.value =
    typeof updaterOrValue === "function"
      ? (updaterOrValue as UpdaterFn)(ref.value)
      : updaterOrValue;
}
