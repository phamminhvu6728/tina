import * as zlib from 'zlib';

export async function extractTextFromFileBuffer(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const lowerFilename = filename.toLowerCase();

  if (lowerFilename.endsWith('.docx')) {
    return extractDocxText(buffer, filename);
  }

  if (lowerFilename.endsWith('.xlsx') || lowerFilename.endsWith('.xls')) {
    return extractExcelText(buffer, filename);
  }

  if (lowerFilename.endsWith('.csv')) {
    return extractCsvText(buffer, filename);
  }

  if (
    lowerFilename.endsWith('.txt') ||
    lowerFilename.endsWith('.json') ||
    lowerFilename.endsWith('.md')
  ) {
    return extractPlainText(buffer, filename);
  }

  return `[Nội dung file: ${filename} (Định dạng chưa được hỗ trợ trích xuất)]`;
}

function extractDocxText(buffer: Buffer, filename: string): string {
  try {
    const unzipped = unzipEntries(buffer);
    const docXml = unzipped['word/document.xml'];
    if (docXml) {
      const text = extractXmlTextNodes(docXml.toString('utf-8'));
      if (text.trim().length > 0) {
        return `--- BẮT ĐẦU FILE WORD (.docx): ${filename} ---\n${text.trim()}\n--- KẾT THÚC FILE WORD: ${filename} ---`;
      }
    }
  } catch {
    // Ignore and try fallback regex
  }

  const fallbackText = extractXmlTextNodes(buffer.toString('utf-8'));
  if (fallbackText.trim().length > 0) {
    return `--- BẮT ĐẦU FILE WORD (.docx): ${filename} ---\n${fallbackText.trim()}\n--- KẾT THÚC FILE WORD: ${filename} ---`;
  }

  return `--- BẮT ĐẦU FILE WORD: ${filename} ---\n(Không thể trích xuất văn bản từ file Word này)\n--- KẾT THÚC FILE WORD ---`;
}

function extractExcelText(buffer: Buffer, filename: string): string {
  try {
    const unzipped = unzipEntries(buffer);
    const sharedStringsXml =
      unzipped['xl/sharedStrings.xml']?.toString('utf-8') || '';
    const sharedStrings = parseSharedStrings(sharedStringsXml);

    let output = `--- BẮT ĐẦU FILE EXCEL: ${filename} ---\n`;
    let foundSheet = false;

    // Iterate over all sheet XML files
    for (const [path, data] of Object.entries(unzipped)) {
      if (path.startsWith('xl/worksheets/sheet') && path.endsWith('.xml')) {
        foundSheet = true;
        const sheetName = path
          .replace('xl/worksheets/', '')
          .replace('.xml', '');
        const sheetXml = data.toString('utf-8');
        const rows = parseSheetXmlRows(sheetXml, sharedStrings);

        if (rows.length > 0) {
          output += `\n### SHEET: ${sheetName}\n`;
          output += formatRowsToMarkdownTable(rows);
          output += '\n';
        }
      }
    }

    if (foundSheet) {
      output += `--- KẾT THÚC FILE EXCEL: ${filename} ---`;
      return output;
    }
  } catch {
    // Ignore fallback
  }

  return extractCsvText(buffer, filename);
}

function extractCsvText(buffer: Buffer, filename: string): string {
  const content = buffer.toString('utf-8');
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return `--- BẮT ĐẦU FILE CSV: ${filename} ---\n(File CSV rỗng)\n--- KẾT THÚC FILE CSV ---`;
  }

  const rows = lines.map((line) =>
    line.split(',').map((col) => col.trim().replace(/^"|"$/g, '')),
  );
  let output = `--- BẮT ĐẦU FILE CSV: ${filename} ---\n`;
  output += formatRowsToMarkdownTable(rows);
  output += `\n--- KẾT THÚC FILE CSV: ${filename} ---`;
  return output;
}

function extractPlainText(buffer: Buffer, filename: string): string {
  const content = buffer.toString('utf-8');
  return `--- BẮT ĐẦU FILE VĂN BẢN: ${filename} ---\n${content}\n--- KẾT THÚC FILE VĂN BẢN ---`;
}

function formatRowsToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return '';
  const maxCols = Math.max(...rows.map((r) => r.length));
  if (maxCols === 0) return '';

  let table = '';
  const header = rows[0];
  const paddedHeader = Array.from(
    { length: maxCols },
    (_, i) => header[i] || `Col_${i + 1}`,
  );

  table += '| ' + paddedHeader.join(' | ') + ' |\n';
  table += '| ' + paddedHeader.map(() => '---').join(' | ') + ' |\n';

  for (let i = 1; i < Math.min(rows.length, 200); i++) {
    const row = rows[i];
    const paddedRow = Array.from({ length: maxCols }, (_, k) => row[k] || '');
    table += '| ' + paddedRow.join(' | ') + ' |\n';
  }

  if (rows.length > 200) {
    table += `\n*(Đã ẩn ${rows.length - 200} dòng dữ liệu còn lại...)*\n`;
  }

  return table;
}

function extractXmlTextNodes(xml: string): string {
  const matches = xml.match(/<w:t[^>]*>(.*?)<\/w:t>/gi);
  if (!matches) return '';
  return matches.map((tag) => tag.replace(/<[^>]+>/g, '')).join(' ');
}

function parseSharedStrings(xml: string): string[] {
  if (!xml) return [];
  const matches = xml.match(/<t[^>]*>(.*?)<\/t>/gi);
  if (!matches) return [];
  return matches.map((tag) => tag.replace(/<[^>]+>/g, ''));
}

function parseSheetXmlRows(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  const rowMatches = xml.match(/<row[^>]*>(.*?)<\/row>/gi);
  if (!rowMatches) return rows;

  for (const rowXml of rowMatches) {
    const cellMatches = rowXml.match(/<c[^>]*>(.*?)<\/c>/gi);
    if (!cellMatches) continue;

    const rowData: string[] = [];
    for (const cellXml of cellMatches) {
      const isSharedString = cellXml.includes('t="s"');
      const valMatch = cellXml.match(/<v>(.*?)<\/v>/i);
      if (valMatch) {
        const rawVal = valMatch[1];
        if (isSharedString) {
          const idx = parseInt(rawVal, 10);
          rowData.push(sharedStrings[idx] ?? rawVal);
        } else {
          rowData.push(rawVal);
        }
      } else {
        const textMatch = cellXml.match(/<t[^>]*>(.*?)<\/t>/i);
        if (textMatch) {
          rowData.push(textMatch[1]);
        }
      }
    }

    if (rowData.length > 0) {
      rows.push(rowData);
    }
  }

  return rows;
}

function unzipEntries(buffer: Buffer): Record<string, Buffer> {
  const entries: Record<string, Buffer> = {};

  try {
    let eocdPos = -1;
    for (let i = buffer.length - 22; i >= 0; i--) {
      if (buffer.readUInt32LE(i) === 0x06054b50) {
        eocdPos = i;
        break;
      }
    }

    if (eocdPos !== -1) {
      const cdOffset = buffer.readUInt32LE(eocdPos + 16);
      const cdEntriesCount = buffer.readUInt16LE(eocdPos + 10);
      let cdPos = cdOffset;

      for (let i = 0; i < cdEntriesCount; i++) {
        if (
          cdPos >= buffer.length ||
          buffer.readUInt32LE(cdPos) !== 0x02014b50
        ) {
          break;
        }

        const compressionMethod = buffer.readUInt16LE(cdPos + 10);
        const compressedSize = buffer.readUInt32LE(cdPos + 20);
        const filenameLen = buffer.readUInt16LE(cdPos + 28);
        const extraLen = buffer.readUInt16LE(cdPos + 30);
        const commentLen = buffer.readUInt16LE(cdPos + 32);
        const localHeaderOffset = buffer.readUInt32LE(cdPos + 42);

        const nameStart = cdPos + 46;
        const entryName = buffer.toString(
          'utf-8',
          nameStart,
          nameStart + filenameLen,
        );

        if (localHeaderOffset + 30 <= buffer.length) {
          const localFilenameLen = buffer.readUInt16LE(localHeaderOffset + 26);
          const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
          const dataStart =
            localHeaderOffset + 30 + localFilenameLen + localExtraLen;

          if (
            compressedSize > 0 &&
            dataStart + compressedSize <= buffer.length
          ) {
            const rawData = buffer.slice(dataStart, dataStart + compressedSize);
            if (compressionMethod === 8) {
              try {
                entries[entryName] = zlib.inflateRawSync(rawData);
              } catch {
                // Ignore
              }
            } else if (compressionMethod === 0) {
              entries[entryName] = rawData;
            }
          }
        }

        cdPos += 46 + filenameLen + extraLen + commentLen;
      }

      if (Object.keys(entries).length > 0) {
        return entries;
      }
    }
  } catch {
    // Fallback to local scan
  }

  let pos = 0;
  while (pos < buffer.length - 30) {
    if (buffer.readUInt32LE(pos) !== 0x04034b50) {
      pos++;
      continue;
    }

    const compressionMethod = buffer.readUInt16LE(pos + 8);
    const compressedSize = buffer.readUInt32LE(pos + 18);
    const filenameLen = buffer.readUInt16LE(pos + 26);
    const extraLen = buffer.readUInt16LE(pos + 28);

    const nameStart = pos + 30;
    const entryName = buffer.toString(
      'utf-8',
      nameStart,
      nameStart + filenameLen,
    );
    const dataStart = nameStart + filenameLen + extraLen;

    if (compressedSize > 0 && dataStart + compressedSize <= buffer.length) {
      const rawData = buffer.slice(dataStart, dataStart + compressedSize);
      if (compressionMethod === 8) {
        try {
          entries[entryName] = zlib.inflateRawSync(rawData);
        } catch {
          // Ignore
        }
      } else if (compressionMethod === 0) {
        entries[entryName] = rawData;
      }
    }

    pos = dataStart + compressedSize;
  }

  return entries;
}
