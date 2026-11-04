import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLE_RATE = 24_000;
export const MAX_DURATION_SECONDS = 300;
const BYTES_PER_SAMPLE = 2;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const frame = (seconds) => Math.round(seconds * SAMPLE_RATE);

function seconds(value, name, allowZero = true) {
  assert(
    Number.isFinite(value) && (allowZero ? value >= 0 : value > 0),
    `${name} must be finite and ${allowZero ? 'nonnegative' : 'positive'}.`,
  );
  return value;
}
function matchesSeconds(actual, expected, name) {
  seconds(actual, name);
  assert(
    Math.abs(actual - expected) <= 1 / SAMPLE_RATE,
    `${name} disagrees with the narration manifest.`,
  );
}
function safeFilename(file, extension) {
  assert(
    typeof file === 'string' &&
      file === path.basename(file) &&
      !file.includes('\\') &&
      !file.includes('/') &&
      !file.includes(':') &&
      file.endsWith(extension),
    `Use a local ${extension} filename without path components.`,
  );
  return file;
}

/** Parse bounded RIFF chunks without assuming that fmt/data occupy fixed offsets. */
export function parsePcmWav(buffer) {
  assert(Buffer.isBuffer(buffer), 'WAV input must be a Buffer.');
  assert(
    buffer.length >= 44 && buffer.length <= MAX_SOURCE_BYTES,
    'WAV size is outside the supported range.',
  );
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF', 'Expected a little-endian RIFF WAV.');
  assert.equal(buffer.toString('ascii', 8, 12), 'WAVE', 'RIFF file is not WAVE audio.');
  const end = buffer.readUInt32LE(4) + 8;
  assert.equal(end, buffer.length, 'RIFF length does not match the file length.');
  let format;
  let pcm;
  let offset = 12;
  while (offset < end) {
    assert(offset + 8 <= end, 'Truncated RIFF chunk header.');
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const chunkEnd = start + size;
    assert(
      chunkEnd <= end && Number.isSafeInteger(chunkEnd),
      'RIFF chunk extends beyond the file.',
    );
    if (id === 'fmt ') {
      assert(!format, 'Duplicate WAV format chunks are ambiguous.');
      assert(size >= 16, 'Truncated PCM format chunk.');
      format = {
        encoding: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        byteRate: buffer.readUInt32LE(start + 8),
        blockAlign: buffer.readUInt16LE(start + 12),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (id === 'data') {
      assert(!pcm, 'Multiple WAV data chunks are unsupported.');
      assert(
        size > 0 && size % BYTES_PER_SAMPLE === 0,
        'PCM data is empty or contains a partial sample.',
      );
      pcm = buffer.subarray(start, chunkEnd);
    }
    offset = chunkEnd + (size % 2);
    assert(offset <= end, 'Missing RIFF padding byte.');
  }
  assert(format && pcm, 'WAV must contain one format chunk and one data chunk.');
  assert.equal(format.encoding, 1, 'Only uncompressed integer PCM WAV is accepted.');
  assert.equal(format.channels, 1, 'Narration must be mono.');
  assert.equal(format.sampleRate, SAMPLE_RATE, 'Narration must use 24,000 Hz.');
  assert.equal(format.bitsPerSample, 16, 'Narration must be PCM16.');
  assert.equal(format.blockAlign, BYTES_PER_SAMPLE, 'Invalid mono PCM16 block alignment.');
  assert.equal(format.byteRate, SAMPLE_RATE * BYTES_PER_SAMPLE, 'Invalid PCM byte rate.');
  return {
    pcm,
    frames: pcm.length / BYTES_PER_SAMPLE,
    durationSeconds: pcm.length / BYTES_PER_SAMPLE / SAMPLE_RATE,
    ...format,
  };
}

export function encodePcmWav(pcm) {
  assert(
    Buffer.isBuffer(pcm) && pcm.length > 0 && pcm.length % BYTES_PER_SAMPLE === 0,
    'PCM must contain complete samples.',
  );
  assert(pcm.length + 36 <= 0xffffffff, 'PCM exceeds RIFF capacity.');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28);
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function captionTime(value, separator) {
  const milliseconds = Math.round(value * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const secs = Math.floor(milliseconds / 1000) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}${separator}${String(milliseconds % 1000).padStart(3, '0')}`;
}
function captionText(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Copy exact sentence samples to their observed times. Unoccupied samples remain zero. */
export function assemblePcm(manifest, timeline, sources) {
  assert.equal(manifest.sampleRate, SAMPLE_RATE, 'Manifest sample rate must be 24,000 Hz.');
  assert.equal(timeline.status, 'passed', 'Only a passed recording may be assembled.');
  assert(
    typeof timeline.videoEpoch === 'string' && Number.isFinite(Date.parse(timeline.videoEpoch)),
    'Recording videoEpoch must be an ISO timestamp.',
  );
  safeFilename(timeline.videoFile, '.webm');
  const duration = seconds(timeline.durationSeconds, 'Recording duration', false);
  assert(
    duration <= MAX_DURATION_SECONDS,
    `Recording is ${duration.toFixed(3)} seconds, exceeding the ${MAX_DURATION_SECONDS}-second limit. No audio was shortened or accelerated.`,
  );
  assert(
    Array.isArray(manifest.segments) && manifest.segments.length > 0,
    'Narration has no segments.',
  );
  assert(Array.isArray(timeline.cues), 'Recording has no cue array.');
  const expected = [];
  const parsedSources = new Map();
  for (const [index, segment] of manifest.segments.entries()) {
    assert.equal(segment.segment, index + 1, 'Manifest segments must be consecutive and ordered.');
    safeFilename(segment.file, '.wav');
    assert(!parsedSources.has(segment.file), 'A WAV filename is assigned to multiple segments.');
    const bytes = sources.get(segment.file);
    assert(bytes, `Missing narration source: ${segment.file}`);
    const parsed = parsePcmWav(bytes);
    matchesSeconds(segment.duration, parsed.durationSeconds, `Segment ${segment.segment} duration`);
    parsedSources.set(segment.file, { ...parsed, sha256: hash(bytes) });
    assert(
      Array.isArray(segment.cues) && segment.cues.length > 0,
      'Each narration segment needs sentence cues.',
    );
    let previousEnd = 0;
    for (const [cueIndex, cue] of segment.cues.entries()) {
      assert(
        typeof cue.text === 'string' && cue.text.trim() && !/[\r\n\x00]/.test(cue.text),
        'Cue text must be one nonempty sentence line.',
      );
      seconds(cue.start, 'Source cue start');
      seconds(cue.end, 'Source cue end', false);
      assert(
        cue.start >= previousEnd && cue.end > cue.start,
        'Source narration cues overlap or run backwards.',
      );
      assert(
        cue.end <= parsed.durationSeconds + 1 / SAMPLE_RATE,
        'Source cue extends beyond its WAV.',
      );
      expected.push({
        segment: segment.segment,
        cue: cueIndex,
        file: segment.file,
        text: cue.text,
        start: cue.start,
        end: cue.end,
      });
      previousEnd = cue.end;
    }
  }
  assert.equal(
    timeline.cues.length,
    expected.length,
    'Recording cue coverage does not match the complete narration.',
  );
  const outputFrames = Math.ceil(duration * SAMPLE_RATE);
  const pcm = Buffer.alloc(outputFrames * BYTES_PER_SAMPLE);
  const placements = [];
  let previousEndFrame = 0;
  let previousCompleted = 0;
  let usedFrames = 0;
  for (const [index, entry] of timeline.cues.entries()) {
    const source = expected[index];
    assert.equal(
      entry.segment,
      source.segment,
      `Cue ${index} segment is missing, duplicated, or reordered.`,
    );
    assert.equal(entry.cue, source.cue, `Cue ${index} index is missing, duplicated, or reordered.`);
    assert.equal(entry.text, source.text, `Cue ${index} text does not match its source sentence.`);
    assert(!entry.failed, 'A failed cue cannot be used in a completed narration.');
    const sourceDuration = source.end - source.start;
    matchesSeconds(entry.audioDurationSeconds, sourceDuration, `Cue ${index} audio duration`);
    const start = seconds(entry.startSeconds, `Cue ${index} video start`);
    if (entry.endSeconds !== undefined)
      matchesSeconds(entry.endSeconds, start + sourceDuration, `Cue ${index} video end`);
    if (entry.sourceFile !== undefined)
      assert.equal(entry.sourceFile, source.file, 'Cue references the wrong WAV.');
    if (entry.sourceStart !== undefined)
      matchesSeconds(entry.sourceStart, source.start, 'Source trim start');
    if (entry.sourceEnd !== undefined)
      matchesSeconds(entry.sourceEnd, source.end, 'Source trim end');
    assert(
      start + 1 / SAMPLE_RATE >= previousCompleted,
      'A cue begins before the previous recorded action finished.',
    );
    const sourceStartFrame = frame(source.start);
    const sourceEndFrame = frame(source.end);
    const frames = sourceEndFrame - sourceStartFrame;
    const startFrame = frame(start);
    const endFrame = startFrame + frames;
    assert(frames > 0, 'A narration sentence has no audio samples.');
    assert(startFrame >= previousEndFrame, 'Placed narration cues overlap.');
    assert(endFrame <= outputFrames, 'Placed narration extends beyond the recording duration.');
    const parsed = parsedSources.get(source.file);
    assert(sourceEndFrame <= parsed.frames, 'Source trim exceeds its WAV samples.');
    parsed.pcm.copy(
      pcm,
      startFrame * BYTES_PER_SAMPLE,
      sourceStartFrame * BYTES_PER_SAMPLE,
      sourceEndFrame * BYTES_PER_SAMPLE,
    );
    usedFrames += frames;
    const actualEnd = start + frames / SAMPLE_RATE;
    if (entry.actionEndSeconds !== undefined) {
      seconds(entry.actionEndSeconds, 'Action completion');
      assert(entry.actionEndSeconds >= start, 'Action ends before its cue begins.');
    }
    if (entry.completedAtSeconds !== undefined) {
      seconds(entry.completedAtSeconds, 'Cue completion');
      assert(
        entry.completedAtSeconds + 1 / SAMPLE_RATE >= actualEnd,
        'Cue completes before narration ends.',
      );
      assert(
        entry.completedAtSeconds >= (entry.actionEndSeconds ?? start),
        'Cue completes before its action.',
      );
      assert(entry.completedAtSeconds <= duration, 'Cue completion extends beyond the recording.');
    }
    previousCompleted =
      entry.completedAtSeconds ?? Math.max(actualEnd, entry.actionEndSeconds ?? 0);
    previousEndFrame = endFrame;
    placements.push({
      segment: entry.segment,
      cue: entry.cue,
      text: entry.text,
      sourceFile: source.file,
      sourceStartFrame,
      sourceEndFrame,
      startSeconds: startFrame / SAMPLE_RATE,
      endSeconds: endFrame / SAMPLE_RATE,
      startFrame,
      endFrame,
      audioDurationSeconds: frames / SAMPLE_RATE,
    });
  }
  const srt = placements
    .map(
      (entry, index) =>
        `${index + 1}\n${captionTime(entry.startSeconds, ',')} --> ${captionTime(entry.endSeconds, ',')}\n${captionText(entry.text)}\n`,
    )
    .join('\n');
  const vtt =
    'WEBVTT\n\n' +
    placements
      .map(
        (entry) =>
          `${captionTime(entry.startSeconds, '.')} --> ${captionTime(entry.endSeconds, '.')}\n${captionText(entry.text)}\n`,
      )
      .join('\n');
  const wav = encodePcmWav(pcm);
  return {
    wav,
    srt,
    vtt,
    metadata: {
      status: 'passed',
      sampleRate: SAMPLE_RATE,
      channels: 1,
      bitsPerSample: 16,
      cueCount: placements.length,
      durationSeconds: outputFrames / SAMPLE_RATE,
      narrationSeconds: usedFrames / SAMPLE_RATE,
      silenceSeconds: (outputFrames - usedFrames) / SAMPLE_RATE,
      limitSeconds: MAX_DURATION_SECONDS,
      withinDurationLimit: true,
      alignment:
        'Each sentence is copied unchanged to its actual cue start, rounded to the nearest 24 kHz sample. All remaining samples are silence; no speed change, resampling, normalization, or cue compression.',
      videoEpoch: timeline.videoEpoch,
      videoFile: timeline.videoFile,
      voiceoverSha256: hash(wav),
      sources: [...parsedSources.entries()].map(([file, parsed]) => ({
        file,
        sha256: parsed.sha256,
        frames: parsed.frames,
      })),
      placements,
    },
  };
}

async function boundedRead(file) {
  const info = await stat(file);
  assert(
    info.isFile() && info.size <= MAX_SOURCE_BYTES,
    'Narration input must be a regular file smaller than 64 MB.',
  );
  return readFile(file);
}
export async function assembleRecording(
  input,
  manifestPath = path.join(root, '.deploy', 'media', 'narration', 'manifest.json'),
) {
  const resolved = path.resolve(input);
  const timelineFile = (await stat(resolved)).isDirectory()
    ? path.join(resolved, 'timeline.json')
    : resolved;
  const directory = path.dirname(timelineFile);
  try {
    const manifestBytes = await boundedRead(manifestPath);
    const timelineBytes = await boundedRead(timelineFile);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    const timeline = JSON.parse(timelineBytes.toString('utf8'));
    const sources = new Map();
    for (const segment of manifest.segments) {
      safeFilename(segment.file, '.wav');
      sources.set(
        segment.file,
        await boundedRead(path.join(path.dirname(manifestPath), segment.file)),
      );
    }
    const result = assemblePcm(manifest, timeline, sources);
    const metadata = {
      ...result.metadata,
      assembledAt: new Date().toISOString(),
      manifestSha256: hash(manifestBytes),
      timelineSha256: hash(timelineBytes),
      files: { audio: 'voiceover.wav', srt: 'captions.srt', vtt: 'captions.vtt' },
    };
    await writeFile(path.join(directory, 'voiceover.wav'), result.wav);
    await writeFile(path.join(directory, 'captions.srt'), result.srt);
    await writeFile(path.join(directory, 'captions.vtt'), result.vtt);
    await writeFile(
      path.join(directory, 'assembly.json'),
      JSON.stringify(metadata, null, 2) + '\n',
    );
    return metadata;
  } catch (error) {
    const failed =
      JSON.stringify(
        {
          status: 'failed',
          failedAt: new Date().toISOString(),
          limitSeconds: MAX_DURATION_SECONDS,
          error: error instanceof Error ? error.message : String(error),
          outputNotice: 'Do not use audio from an earlier assembly in this directory.',
        },
        null,
        2,
      ) + '\n';
    await writeFile(path.join(directory, 'assembly-error.json'), failed);
    await writeFile(path.join(directory, 'assembly.json'), failed);
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Usage: node scripts/assemble-narration.mjs <recording-directory|timeline.json> [--manifest path/to/manifest.json]',
    );
  } else {
    try {
      assert(
        args.length === 1 || (args.length === 3 && args[1] === '--manifest'),
        'Provide a recording directory or timeline JSON, optionally --manifest <path>.',
      );
      const result = await assembleRecording(args[0], args[2] ? path.resolve(args[2]) : undefined);
      console.log(
        JSON.stringify({
          status: result.status,
          cueCount: result.cueCount,
          durationSeconds: result.durationSeconds,
          narrationSeconds: result.narrationSeconds,
          silenceSeconds: result.silenceSeconds,
          withinDurationLimit: result.withinDurationLimit,
        }),
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
