import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeReaderBytes, splitReaderChapters } from '../services/ReaderService';

test('reads UTF-16 BOM text and finds Chinese chapter headings', () => {
  const bytes = new Uint8Array([
    0xff, 0xfe,
    0x2c, 0x7b, 0x00, 0x4e, 0xe0, 0x7a, 0x20, 0x00, 0x00, 0x5f, 0xcb, 0x59,
    0x0a, 0x00,
    0x63, 0x6b, 0x87, 0x65,
    0x0a, 0x00,
    0x2c, 0x7b, 0x8c, 0x4e, 0xe0, 0x7a, 0x20, 0x00, 0xe7, 0x7e, 0xed, 0x7e,
    0x0a, 0x00,
    0xed, 0x7e, 0x87, 0x65
  ]);

  const decoded = decodeReaderBytes(bytes);
  const chapters = splitReaderChapters(decoded.text);

  assert.equal(decoded.encoding, 'utf-16le');
  assert.deepEqual(chapters.map((chapter) => chapter.title), ['第一章 开始', '第二章 继续']);
});

test('uses fixed-size chapters when no headings are present', () => {
  const chapters = splitReaderChapters('x'.repeat(20_000));

  assert.ok(chapters.length >= 2);
  assert.equal(chapters[0].start, 0);
  assert.equal(chapters.at(-1)?.end, 20_000);
});
