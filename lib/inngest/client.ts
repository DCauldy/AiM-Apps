import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "aim-apps",
  name: "AiM Apps",
  isDev: process.env.NODE_ENV === "development",
});
