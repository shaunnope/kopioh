import { I18n } from "https://deno.land/x/grammy_i18n@v1.1.0/mod.ts";

import type { Context } from "./context.ts";
import { config } from "../config.ts";

const i18n = new I18n<Context>({
  defaultLocale: "en",
});

await i18n.loadLocalesDir(config.LOCALES_DIR);

export default i18n;