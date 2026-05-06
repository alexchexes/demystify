import type { Har, Entry } from "har-format";

export const selectFile = (onFinish: (entries: Entry[]) => void, toast: (arg: object) => void = () => { }) => {
  return async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".har,.json";

    input.onchange = async (event) => {
      try {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
          const content = await file.text();
          const parsed = JSON.parse(content) as Har;
          toast({
            title: "Loaded HAR",
            description: "Successfully loaded HAR",
            duration: 5000,
          });
          onFinish(parsed.log.entries);
        }
      } catch (e) {
        console.error("Failed to load HAR file:", e);
        toast({
          title: "Error Loading HAR",
          description:
            e instanceof Error ? e.message : "An unknown error occurred",
          duration: 5000,
        });
      }
    };

    input.click();
    return;
  };
};
