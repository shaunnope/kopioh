import type { Context as DefaultContext } from "https://deno.land/x/grammy@v1.42.0/mod.ts";

import { HydrateFlavor } from "https://deno.land/x/grammy_hydrate@v1.6.0/mod.ts";

import type { I18nFlavor } from "https://deno.land/x/grammy_i18n@v1.1.0/mod.ts";

export type Context =
  HydrateFlavor<
    DefaultContext &
    I18nFlavor
  >
