import fs from "node:fs";
import path from "node:path";
import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import type { EmbedConfig } from "../shared/types.js";
import { loadBaseConfig, resolveUploadsPath } from "../shared/config.js";
import { replacePlaceholders, type PlaceholderValues } from "../shared/placeholders.js";
import { asColor } from "./utils.js";

const config = loadBaseConfig();
const uploadsPath = resolveUploadsPath(config.UPLOADS_DIR);

export interface RenderedMessage {
  content?: string;
  embeds?: EmbedBuilder[];
  files?: AttachmentBuilder[];
}

function attachmentMedia(value: string, files: AttachmentBuilder[]): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith("/uploads/")) return value;
  const fileName = path.basename(value);
  const filePath = path.join(uploadsPath, fileName);
  if (!fs.existsSync(filePath)) return undefined;
  if (!files.some((file) => file.name === fileName)) {
    files.push(new AttachmentBuilder(filePath, { name: fileName }));
  }
  return `attachment://${fileName}`;
}

export function renderEmbedMessage(embedConfig: EmbedConfig, variables: PlaceholderValues): RenderedMessage {
  const files: AttachmentBuilder[] = [];
  const embed = new EmbedBuilder().setColor(asColor(embedConfig.color));
  const title = replacePlaceholders(embedConfig.title, variables);
  const description = replacePlaceholders(embedConfig.description, variables);
  if (title) embed.setTitle(title);
  if (embedConfig.titleUrl) embed.setURL(embedConfig.titleUrl);
  if (description) embed.setDescription(description);
  if (embedConfig.authorName) {
    embed.setAuthor({
      name: replacePlaceholders(embedConfig.authorName, variables),
      iconURL: attachmentMedia(embedConfig.authorIconUrl, files),
      url: embedConfig.authorUrl || undefined
    });
  }
  const imageUrl = attachmentMedia(embedConfig.imageUrl, files);
  if (imageUrl) embed.setImage(imageUrl);
  const thumbnailUrl = attachmentMedia(embedConfig.thumbnailUrl, files);
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  if (embedConfig.footerText) {
    embed.setFooter({
      text: replacePlaceholders(embedConfig.footerText, variables),
      iconURL: attachmentMedia(embedConfig.footerIconUrl, files)
    });
  }
  if (embedConfig.timestamp) embed.setTimestamp();
  const fields = embedConfig.fields
    .filter((field) => field.name && field.value)
    .slice(0, 25)
    .map((field) => ({
      name: replacePlaceholders(field.name, variables).slice(0, 256),
      value: replacePlaceholders(field.value, variables).slice(0, 1024),
      inline: field.inline
    }));
  if (fields.length) embed.addFields(fields);

  const content = replacePlaceholders(embedConfig.content, variables);
  return {
    content: content || undefined,
    embeds: [embed],
    files: files.length ? files : undefined
  };
}
