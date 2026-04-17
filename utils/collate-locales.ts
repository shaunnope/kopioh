const FUNCTION = Deno.env.get("FUNCTION") ?? "kopio-bot"

const localesDir = new URL(`../supabase/functions/${FUNCTION}/locales`, import.meta.url);
const outputDir = new URL(`../supabase/functions/${FUNCTION}/static/locales`, import.meta.url);

async function collate() {
  await Deno.mkdir(outputDir, { recursive: true });

  for await (const locale of Deno.readDir(localesDir)) {
    if (!locale.isDirectory) {
      if (locale.name.endsWith(".ftl")) {
        const src = new URL(locale.name, localesDir + "/");
        const dest = new URL(locale.name, outputDir + "/");
        await Deno.copyFile(src, dest);
        console.log(`Copied ${locale.name} → ${dest.pathname}`);
      }
      continue;
    }

    const localeDir = new URL(`${locale.name}/`, localesDir + "/");
    const files: string[] = [];

    for await (const entry of Deno.readDir(localeDir)) {
      if (entry.isFile && entry.name.endsWith(".ftl")) files.push(entry.name);
    }

    files.sort();

    const parts: string[] = [];
    for (const file of files) {
      const content = await Deno.readTextFile(new URL(file, localeDir));
      parts.push(`# --- ${file} ---\n${content.trimEnd()}`);
    }

    const outputPath = new URL(`${locale.name}.ftl`, outputDir + "/");
    await Deno.writeTextFile(outputPath, parts.join("\n\n") + "\n");
    console.log(`Collated ${files.length} files → ${outputPath.pathname}`);
  }
}

await collate();
