import { I18n } from "https://deno.land/x/grammy_i18n@v1.1.0/mod.ts";

import type { Context } from "./context.ts";
// Create an `I18n` instance.
// Continue reading to find out how to configure the instance.
const i18n = new I18n<Context>({
  defaultLocale: "en",
});

await i18n.loadLocalesDir("locales");

export default i18n;