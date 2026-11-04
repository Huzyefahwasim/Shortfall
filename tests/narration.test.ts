import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assemblePcm,
  encodePcmWav,
  parsePcmWav,
  SAMPLE_RATE,
} from '../scripts/assemble-narration.mjs';

function fixture() {
  const pcm = Buffer.alloc(1200 * 2);
  for (let sample = 0; sample < 1200; sample++) pcm.writeInt16LE(100 + sample, sample * 2);
  const manifest = {
    sampleRate: SAMPLE_RATE,
    segments: [
      {
        segment: 1,
        file: 'segment-1.wav',
        duration: 1200 / SAMPLE_RATE,
        cues: [
          { text: 'First sentence.', start: 100 / SAMPLE_RATE, end: 400 / SAMPLE_RATE },
          { text: 'Second sentence.', start: 700 / SAMPLE_RATE, end: 1000 / SAMPLE_RATE },
        ],
      },
    ],
  };
  const timeline = {
    status: 'passed',
    videoEpoch: '2026-11-04T00:00:00.000Z',
    videoFile: 'video.webm',
    durationSeconds: 1.5,
    cues: [
      {
        segment: 1,
        cue: 0,
        startSeconds: 0.25,
        audioDurationSeconds: 300 / SAMPLE_RATE,
        text: 'First sentence.',
        actionEndSeconds: 0.8,
        completedAtSeconds: 0.8,
      },
      {
        segment: 1,
        cue: 1,
        startSeconds: 1.0,
        audioDurationSeconds: 300 / SAMPLE_RATE,
        text: 'Second sentence.',
        actionEndSeconds: 1.1,
        completedAtSeconds: 1.1,
      },
    ],
  };
  return { manifest, timeline, sources: new Map([['segment-1.wav', encodePcmWav(pcm)]]) };
}

test('sentence samples retain exact values and real action overruns remain silence', () => {
  const { manifest, timeline, sources } = fixture();
  const result = assemblePcm(manifest, timeline, sources);
  const { pcm } = parsePcmWav(result.wav);
  assert.equal(pcm.length, 1.5 * SAMPLE_RATE * 2);
  assert.deepEqual(
    [...Array(3)].map((_, i) => pcm.readInt16LE((6000 + i) * 2)),
    [200, 201, 202],
  );
  assert.deepEqual(
    [...Array(3)].map((_, i) => pcm.readInt16LE((24000 + i) * 2)),
    [800, 801, 802],
  );
  assert(pcm.subarray(0, 6000 * 2).every((byte) => byte === 0));
  assert(pcm.subarray(6300 * 2, 24000 * 2).every((byte) => byte === 0));
  assert(pcm.subarray(24300 * 2).every((byte) => byte === 0));
  assert.equal(result.metadata.silenceSeconds, 1.5 - 600 / SAMPLE_RATE);
  assert.match(result.srt, /00:00:00,250 --> 00:00:00,263\nFirst sentence/);
  assert.match(result.vtt, /^WEBVTT\n\n00:00:00\.250/);
});

test('RIFF parser accepts padded ancillary chunks and rejects unsafe sizes or encoding', () => {
  const { sources } = fixture();
  const original = sources.get('segment-1.wav')!;
  const junk = Buffer.from([74, 85, 78, 75, 1, 0, 0, 0, 123, 0]);
  const extended = Buffer.concat([original.subarray(0, 12), junk, original.subarray(12)]);
  extended.writeUInt32LE(extended.length - 8, 4);
  assert.deepEqual(parsePcmWav(extended).pcm, parsePcmWav(original).pcm);
  const truncated = Buffer.from(extended);
  truncated.writeUInt32LE(0xffffffff, 16);
  assert.throws(() => parsePcmWav(truncated), /beyond the file/);
  const stereo = Buffer.from(original);
  stereo.writeUInt16LE(2, 22);
  assert.throws(() => parsePcmWav(stereo), /mono/);
  const float = Buffer.from(original);
  float.writeUInt16LE(3, 20);
  assert.throws(() => parsePcmWav(float), /integer PCM/);
});

test('assembly rejects missing or changed cues, source offsets, and narration overlap', () => {
  const missing = fixture();
  missing.timeline.cues.pop();
  assert.throws(() => assemblePcm(missing.manifest, missing.timeline, missing.sources), /coverage/);
  const changed = fixture();
  changed.timeline.cues[0].text = 'Different sentence.';
  assert.throws(
    () => assemblePcm(changed.manifest, changed.timeline, changed.sources),
    /text does not match/,
  );
  const overlap = fixture();
  overlap.timeline.cues[1].startSeconds = 0.25;
  assert.throws(
    () => assemblePcm(overlap.manifest, overlap.timeline, overlap.sources),
    /previous recorded action/,
  );
  const offset = fixture();
  const altered = {
    ...offset.timeline,
    cues: offset.timeline.cues.map((cue) => ({ ...cue, sourceStart: 0.1 })),
  };
  assert.throws(() => assemblePcm(offset.manifest, altered, offset.sources), /Source trim start/);
});

test('failed or over-five-minute recordings cannot produce a passing assembly', () => {
  const failed = fixture();
  failed.timeline.status = 'failed';
  assert.throws(
    () => assemblePcm(failed.manifest, failed.timeline, failed.sources),
    /passed recording/,
  );
  const long = fixture();
  long.timeline.durationSeconds = 300.01;
  assert.throws(
    () => assemblePcm(long.manifest, long.timeline, long.sources),
    /exceeding the 300-second limit/,
  );
});
