import { type ExtendedUIMessage, isExtendedFileUIPart } from 'twenty-shared/ai';

import { CODE_INTERPRETER_MIME_TYPES } from 'src/engine/metadata-modules/ai/ai-chat/constants/code-interpreter-mime-types.constant';
import { extractTextFromFileBuffer } from 'src/engine/metadata-modules/ai/ai-chat/utils/file-text-extractor.util';
import { getNativeMimeTypesForModalities } from 'src/engine/metadata-modules/ai/ai-chat/utils/get-native-mime-types-for-modalities.util';

async function readAndExtractFileText(
  fileId: string,
  filename: string,
  workspaceId: string,
): Promise<string | null> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const storageBase =
      process.env.STORAGE_LOCAL_PATH ||
      '/app/packages/twenty-server/.local-storage';

    const wsDir = path.join(storageBase, workspaceId);

    if (!fs.existsSync(wsDir)) {
      return null;
    }

    const appDirs = fs.readdirSync(wsDir);

    for (const appDir of appDirs) {
      const chatDir = path.join(wsDir, appDir, 'agent-chat');

      if (fs.existsSync(chatDir)) {
        const files = fs.readdirSync(chatDir);
        const match = files.find((f) => f.startsWith(fileId));

        if (match) {
          const fullPath = path.join(chatDir, match);
          const buffer = fs.readFileSync(fullPath);

          return await extractTextFromFileBuffer(buffer, filename);
        }
      }
    }
  } catch {
    // Ignore extraction failure
  }

  return null;
}

export const replaceUnsupportedFileParts = async (
  messages: ExtendedUIMessage[],
  modalities: string[] = [],
  isCodeInterpreterEnabled: boolean,
  workspaceId?: string,
): Promise<ExtendedUIMessage[]> => {
  const nativeMimeTypes = getNativeMimeTypesForModalities(modalities);

  return Promise.all(
    messages.map(async (message) => {
      if (message.role !== 'user' || !message.parts) {
        return message;
      }

      const newParts: typeof message.parts = [];

      for (const part of message.parts) {
        if (isExtendedFileUIPart(part)) {
          const mimeType = part.mediaType ?? '';

          const isSupported =
            (isCodeInterpreterEnabled &&
              CODE_INTERPRETER_MIME_TYPES.has(mimeType)) ||
            nativeMimeTypes.has(mimeType);

          if (isSupported) {
            newParts.push(part);
          } else {
            const filename = part.filename ?? 'uploaded_file';
            const fileId = part.fileId;

            let extractedText: string | null = null;

            if (fileId && workspaceId) {
              extractedText = await readAndExtractFileText(
                fileId,
                filename,
                workspaceId,
              );
            }

            if (extractedText && extractedText.trim().length > 0) {
              newParts.push({
                type: 'text',
                text: extractedText,
              });
            } else {
              newParts.push({
                type: 'text',
                text: `[Attached file: ${filename} (type: ${mimeType || 'unknown'}) — file type is not supported for direct analysis]`,
              });
            }
          }
        } else {
          newParts.push(part);
        }
      }

      return { ...message, parts: newParts };
    }),
  );
};
