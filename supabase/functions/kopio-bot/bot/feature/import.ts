import { Composer, InlineKeyboard } from "grammy";
import { Context, Conversation, ConversationContext } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import { awaitContext } from "../helper/content_type.ts";
import db, { type ImportInput } from "../../database/index.ts";
import { config } from "../../config.ts";

const composer = new Composer<Context>();
const feature = composer.chatType("private");

const CANCEL = "import:cancel";

/**
 * Validate and normalise raw parsed JSON into ImportInput[].
 * Returns null if the shape is unrecognisable.
 */
function parseImportData(raw: unknown): ImportInput[] | null {
  if (!Array.isArray(raw)) return null;
  const entries: ImportInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || !("content" in item)) return null;
    entries.push({
      status:     typeof item.status     === "string" ? item.status     : undefined,
      created_by: typeof item.created_by === "number" ? item.created_by : null,
      content:    item.content,
      queue_id:   typeof item.queue_id   === "string" ? item.queue_id   : null,
    });
  }
  return entries;
}

export async function importConvo(conversation: Conversation, ctx0: ConversationContext) {
  const connection = await conversation.external((ctx) => ctx.session.connection);
  if (!connection) {
    await ctx0.reply(ctx0.t("connect.no-connection"));
    return;
  }

  // Step 1: prompt for the JSON file
  const cancelKb = new InlineKeyboard().text(ctx0.t("command.cancel"), CANCEL);
  const prompt = await ctx0.reply(ctx0.t("import.prompt"), { reply_markup: cancelKb });

  // Step 2: wait for a .json document, re-prompting on wrong input
  const fileCtx = await awaitContext(conversation, CANCEL, async (ctx) => {
    if (!ctx.message?.document) {
      await ctx.reply(ctx0.t("import.send-json"));
      return false;
    }
    if (!ctx.message.document.file_name?.endsWith(".json")) {
      await ctx.reply(ctx0.t("import.not-json"));
      return false;
    }
    return true;
  });

  await ctx0.api.deleteMessage(prompt.chat.id, prompt.message_id).catch(() => {});

  if (!fileCtx) {
    await ctx0.reply(ctx0.t("command.cancelled"));
    return;
  }

  // Step 3: download and parse
  const doc = fileCtx.message!.document!;
  let importable: ImportInput[];
  try {
    const file = await ctx0.api.getFile(doc.file_id);
    const url = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`;
    const text = await conversation.external(async () => {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.text();
    });
    const parsed = parseImportData(JSON.parse(text));
    if (!parsed) throw new Error("invalid shape");
    // skip rejected entries — nothing to do with them
    importable = parsed.filter(e => e.status !== "rejected");
  } catch {
    await ctx0.reply(ctx0.t("import.parse-error"));
    return;
  }

  if (importable.length === 0) {
    await ctx0.reply(ctx0.t("import.empty-file"));
    return;
  }

  // Step 4: show summary and ask how to import
  const autoEligible = importable.filter(
    e => e.status === "approved" || e.status === "posted",
  ).length;

  const confirmKb = new InlineKeyboard()
    .text(ctx0.t("import.confirm-pending"), "import:confirm:pending")
    .row()
    .text(ctx0.t("import.confirm-approve", { count: autoEligible }), "import:confirm:approve")
    .row()
    .text(ctx0.t("command.cancel"), CANCEL);

  const summaryMsg = await ctx0.reply(
    ctx0.t("import.summary", { total: importable.length, eligible: autoEligible }),
    { reply_markup: confirmKb },
  );

  // Step 5: wait for the confirmation choice
  const actionCtx = await conversation.waitForCallbackQuery(
    /^import:(confirm:(pending|approve)|cancel)$/,
  );
  await actionCtx.answerCallbackQuery();
  await ctx0.api.editMessageReplyMarkup(summaryMsg.chat.id, summaryMsg.message_id).catch(() => {});

  if (actionCtx.callbackQuery.data === CANCEL) {
    await ctx0.api.editMessageText(summaryMsg.chat.id, summaryMsg.message_id, ctx0.t("command.cancelled")).catch(() => {});
    return;
  }

  const autoApprove = actionCtx.callbackQuery.data === "import:confirm:approve";

  // Step 6: resolve queue IDs valid for this connection and run the import
  const queues = await conversation.external(() => db.getQueuesForConnection(connection.id));
  const validQueueIds = new Set(queues.map(q => q.id));

  const result = await conversation.external(() =>
    db.importSubmissions(connection.broadcastId, importable, ctx0.from!.id, autoApprove, validQueueIds)
  );

  await ctx0.api.editMessageText(
    summaryMsg.chat.id,
    summaryMsg.message_id,
    ctx0.t("import.success", { imported: result.imported, approved: result.approved }),
  ).catch(() => {});
}

feature.command("import", logHandle("command-import"), async (ctx) => {
  await ctx.conversation.enter("importConvo");
});

export { composer as importFeature };
