// Fast drop-in for csv-reader 1.0.0: reads broken CSV exactly as it does.
// Single left-to-right pass with a per-record character scanner; quoted
// fields jump between quotes with indexOf. Errors recorded in order met.

export function run(input) {
  const text = input.text;
  const header = input.header;
  const n = text.length;
  let i = 0;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) i = 1;

  const records = [];
  const errors = [];
  let line = 1;
  let width = -1;

  // Append text[a..b) to parts with CRLF / lone CR read as LF, counting lines.
  function pushQuoted(parts, a, b) {
    if (a >= b) return;
    const s = text.slice(a, b);
    let r = s.indexOf("\r");
    if (r === -1) {
      let cnt = 0;
      let p = -1;
      while ((p = s.indexOf("\n", p + 1)) !== -1) cnt++;
      line += cnt;
      parts.push(s);
      return;
    }
    const pieces = [];
    let seg = 0;
    while (r !== -1) {
      pieces.push(s.slice(seg, r));
      line++;
      seg = s.charCodeAt(r + 1) === 10 ? r + 2 : r + 1;
      r = s.indexOf("\r", seg);
    }
    pieces.push(s.slice(seg));
    for (let k = 0; k < pieces.length; k++) {
      const piece = pieces[k];
      let cnt = 0;
      let p = -1;
      while ((p = piece.indexOf("\n", p + 1)) !== -1) cnt++;
      line += cnt;
    }
    parts.push(pieces.join("\n"));
  }

  while (i < n) {
    const c0 = text.charCodeAt(i);
    if (c0 === 10) { i++; line++; continue; }
    if (c0 === 13 && text.charCodeAt(i + 1) === 10) { i += 2; line++; continue; }

    const recLine = line;
    const rowIdx = header ? (records.length === 0 ? null : records.length - 1) : records.length;
    const fields = [];
    let seg = i;
    let parts = null;
    let atFieldStart = true;
    let hadContent = false;
    let junkFrom = -1; // parts index where junk pieces begin; -1 = no quoted part

    // Ends the current field at position end (exclusive).
    // Returns the field value; emits quote_junk when junk was kept.
    function endField(end) {
      if (parts === null) return text.slice(seg, end);
      if (junkFrom >= 0) {
        let junkLen = end - seg;
        for (let k = junkFrom; k < parts.length; k++) junkLen += parts[k].length;
        if (junkLen > 0) errors.push({ code: "quote_junk", line: recLine, row: rowIdx });
      }
      if (seg < end) parts.push(text.slice(seg, end));
      return parts.length === 1 ? parts[0] : parts.join("");
    }

    let recordDone = false;
    while (!recordDone) {
      if (i >= n) {
        fields.push(endField(n));
        recordDone = true;
        break;
      }
      const c = text.charCodeAt(i);
      if (c === 44) { // ,
        fields.push(endField(i));
        parts = null;
        junkFrom = -1;
        i++;
        seg = i;
        atFieldStart = true;
        hadContent = true;
      } else if (c === 10) { // LF
        fields.push(endField(i));
        i++;
        line++;
        recordDone = true;
      } else if (c === 13) { // CR
        if (text.charCodeAt(i + 1) === 10) {
          fields.push(endField(i));
          i += 2;
          line++;
          recordDone = true;
        } else {
          errors.push({ code: "stray_cr", line: recLine, row: rowIdx });
          if (parts === null) parts = [];
          parts.push(text.slice(seg, i));
          i++;
          seg = i;
          atFieldStart = false; // a dropped CR still counts as field content
        }
      } else if (c === 34 && atFieldStart) { // opening quote
        hadContent = true;
        const qStart = i;
        const line0 = line;
        i++;
        const qparts = [];
        let qseg = i;
        let closed = false;
        for (;;) {
          const q = text.indexOf('"', i);
          if (q === -1) break;
          if (text.charCodeAt(q + 1) === 34) {
            pushQuoted(qparts, qseg, q);
            qparts.push('"');
            i = q + 2;
            qseg = i;
          } else {
            pushQuoted(qparts, qseg, q);
            i = q + 1;
            closed = true;
            break;
          }
        }
        if (!closed) {
          errors.push({ code: "unterminated_quote", line: recLine, row: rowIdx });
          line = line0;
          i = qStart + 1;
          parts = ['"'];
          seg = i;
          atFieldStart = false;
          junkFrom = -1;
        } else {
          parts = qparts;
          junkFrom = qparts.length;
          seg = i;
          atFieldStart = false;
        }
      } else {
        hadContent = true;
        atFieldStart = false;
        i++;
      }
    }

    if (!hadContent) continue; // line of only dropped stray CRs: no record

    if (width === -1) {
      width = fields.length;
    } else if (fields.length < width) {
      errors.push({ code: "short_row", line: recLine, row: rowIdx, fields: fields.length });
      while (fields.length < width) fields.push("");
    } else if (fields.length > width) {
      errors.push({ code: "long_row", line: recLine, row: rowIdx, extra: fields.slice(width) });
      fields.length = width;
    }
    records.push(fields);
  }

  let columns = null;
  let rows = records;
  if (header) {
    columns = records.length > 0 ? records[0] : [];
    rows = records.slice(1);
  }
  return { columns, rows, errors };
}
