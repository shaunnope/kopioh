import { I18n } from "grammy_i18n";

import type { Context } from "./context.ts";
import { config } from "../config.ts";
import { MiddlewareFn } from "grammy";
import { logger } from "../logger.ts";

/**
 * A list of all supported locales in production.
 */
const SUPPORTED_LOCALES = ["en"]

const i18n = new I18n<Context>({
  defaultLocale: "en",
});

async function loadStaticLocales(): Promise<void> {
  const dir = config.LOCALES_DIR;
  for (const code of SUPPORTED_LOCALES) {
    try {
      const source = await Deno.readTextFile(`${dir}/${code}.ftl`);
      await i18n.loadLocale(code, { source });
    }
    catch (error) {
      logger.warn(`Error loading locale ${code}: ${error}`)
    }
  }
}

const loadLocales: Promise<void> =
  config.DEPLOY_ENV === "test"
  ? Promise.resolve()
  : config.env_isProd && config.PLATFORM === "supabase"
  ? loadStaticLocales()
  : i18n.loadLocalesDir(config.LOCALES_DIR);

export const waitForLocales: MiddlewareFn = async (_, next) => {
  await loadLocales
  await next()
}

export default i18n;
export const isMultipleLocales = i18n.locales.length > 1;