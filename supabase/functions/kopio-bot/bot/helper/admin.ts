/**
 * Administrative middleware
 */
import { Api } from "grammy";
import db from "../../database/index.ts";

export async function getConnection(api: Api, submitId: number) {
    const newConnection = await db.getConnectionBySubmitId(submitId);
    if (!newConnection)
        return null

    const connection = { id: newConnection.id, broadcastId: newConnection.broadcast_id, submitId: newConnection.submit_id, logsId: newConnection.logs_id ?? null }
    const connectionMeta = await getConnectionMeta(api, connection.id, submitId);

    return { connection, connectionMeta }
}

/**
 * Construct a fresh `connectionMeta` value.
 * Saves the title of the chat from the given chat id, defaulting to the stringified id, if
 * the title is not defined.
 * @param api 
 * @param id The uuid identifier for the connection
 * @param chatId 
 * @returns 
 */
export async function getConnectionMeta(api: Api, id: string, chatId: number) {
    const chatInfo = await api.getChat(chatId).catch(() => null)
    // get the chat title, using chat id as a fallback
    const title = (chatInfo && "title" in chatInfo ? chatInfo.title : null) ?? String(chatId)

    return { id, title, updated: Date.now() }
}
