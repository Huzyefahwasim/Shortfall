import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

for (const [directory, count] of [
  ['fixtures/evaluation-v1', 24],
  ['fixtures/evaluation-csv-fresh-v1', 4],
] as const) {
  test(`${directory} retains the frozen input files and expected labels`, async () => {
    const serialized = await readFile(path.join(directory, 'manifest.json'), 'utf8');
    const expectedHash = (await readFile(path.join(directory, 'manifest.sha256'), 'utf8')).trim();
    assert.equal(hash(serialized), expectedHash);
    const manifest = JSON.parse(serialized);
    assert.equal(manifest.documents.length, count);
    for (const entry of manifest.documents) {
      const raw = await readFile(path.join(directory, entry.file));
      assert.equal(hash(raw), entry.rawSha256, `${entry.id}: original file changed`);
      const text = entry.textFile
        ? await readFile(path.join(directory, entry.textFile), 'utf8')
        : raw.toString('utf8').replaceAll('\r\n', '\n').trim();
      assert.equal(hash(text), entry.textSha256, `${entry.id}: extracted source changed`);
      if (entry.expectedOutcome === 'accept' && entry.kind !== 'receipt') {
        assert.equal(
          entry.expectedFields.quantity * entry.expectedFields.unitPriceCents,
          entry.expectedFields.totalCents,
          `${entry.id}: supported labels contain inconsistent arithmetic`,
        );
      }
    }
  });
}
