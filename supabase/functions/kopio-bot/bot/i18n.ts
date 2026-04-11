import { I18n } from "grammy_i18n";

import type { Context } from "./context.ts";
import { config } from "../config.ts";

const i18n = new I18n<Context>({
  defaultLocale: "en",
});

await i18n.loadLocalesDir(config.LOCALES_DIR);

export default i18n;