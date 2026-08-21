export const escapeCsvValue = (value: unknown): string => {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

/** Builds a CSV string (headers + rows) from arrays of raw values. */
export const buildCsv = (headers: string[], rows: unknown[][]): string => {
  const lines = [headers.map(escapeCsvValue).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(','));
  }
  return lines.join('\n');
};

export const sendCsv = (
  res: import('express').Response,
  fileName: string,
  csv: string
): void => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.status(200).send(csv);
};
