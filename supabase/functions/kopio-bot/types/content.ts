import { Message } from "grammy/types";


export function getContent(message: Message) {
    return {
        quote: message.quote,

        text: message.text,
        entities: message.entities,

        caption: message.caption,
        caption_entities: message.caption_entities,
        show_caption_above_media: message.show_caption_above_media,
        has_media_spoiler: message.has_media_spoiler,

        // checklist: message.checklist,
        // contact: message.contact,
        // venue: message.venue,
        // location: message.location,
        photo: message.photo,
        video: message.video,
        document: message.document,
        audio: message.audio,
        voice: message.voice,
        animation: message.animation,
        sticker: message.sticker,
        poll: message.poll,
    }
}

/**
 * Relevant fields from a Message object for reposting
 */
export type Content = ReturnType<typeof getContent>