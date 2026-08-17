// Cut the dead run off the front of a finished recording, without re-encoding.
//
// Playwright films the whole life of the page, but a demo doesn't start until
// the app has loaded and the title card goes up — and in a dev stack that is
// twenty-odd seconds later. Left in, the finished video opens on a blank frame
// and then on a motionless page, which on the landing page is indistinguishable
// from a broken player. `Overlay` records when the first overlay appeared and
// the fixture cuts the film to it.
//
// The cut is lossless. VP8 inter frames are differences against the frame
// before, so the film can only be opened at a keyframe (one every ~5s here);
// we keep the last one before the mark and drop everything earlier, then also
// drop the run of "nothing changed" frames that follows it — those are ~30-byte
// no-ops, so the decoder reaches the same picture without them. No frame is
// re-encoded, so what ships is what was filmed.

import { readFileSync, writeFileSync } from 'node:fs';

const ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
  CueTime: 0xb3,
  CueTrackPositions: 0xb7,
  CueTrack: 0xf7,
  CueClusterPosition: 0xf1,
};

/**
 * A frame this small changed nothing on screen: VP8 spends ~30 bytes on a
 * "skip everything" frame and thousands on the smallest real update, so the
 * gap between the two is orders of magnitude wide.
 */
const STILL_FRAME_BYTES = 256;

/** Don't rewrite a file to save less than this. */
const MIN_TRIM_MS = 400;

interface Frame {
  time: number;
  keyframe: boolean;
  bytes: number;
  block: Buffer;
  trackLength: number;
}

interface Element {
  id: number;
  start: number;
  dataStart: number;
  dataEnd: number;
}

interface Webm {
  buf: Buffer;
  ebml: Element;
  info: Element;
  tracks: Element;
  frames: Frame[];
}

export interface TrimResult {
  buffer: Buffer;
  /** Film removed from the front, in ms. */
  trimmedMs: number;
  durationMs: number;
  droppedFrames: number;
}

// ---------------------------------------------------------------- EBML reading

function readId(buf: Buffer, pos: number): { id: number; length: number } {
  const first = buf[pos];
  if (first === undefined || first === 0) throw new Error(`bad element id at ${pos}`);
  let length = 1;
  for (let mask = 0x80; !(first & mask); mask >>= 1) length++;
  if (length > 4) throw new Error(`bad element id at ${pos}`);
  let id = 0;
  for (let i = 0; i < length; i++) id = id * 256 + (buf[pos + i] ?? 0);
  return { id, length };
}

function readSize(buf: Buffer, pos: number): { size: number; length: number; unknown: boolean } {
  const first = buf[pos];
  if (first === undefined || first === 0) throw new Error(`bad element size at ${pos}`);
  let length = 1;
  let mask = 0x80;
  for (; !(first & mask); mask >>= 1) length++;
  let size = first & (mask - 1);
  let unknown = size === mask - 1;
  for (let i = 1; i < length; i++) {
    const byte = buf[pos + i] ?? 0;
    size = size * 256 + byte;
    if (byte !== 0xff) unknown = false;
  }
  return { size, length, unknown };
}

function* children(buf: Buffer, start: number, end: number): Generator<Element> {
  let pos = start;
  while (pos < end) {
    const id = readId(buf, pos);
    const size = readSize(buf, pos + id.length);
    const dataStart = pos + id.length + size.length;
    const dataEnd = size.unknown ? end : Math.min(dataStart + size.size, end);
    yield { id: id.id, start: pos, dataStart, dataEnd };
    pos = dataEnd;
  }
}

function uint(buf: Buffer, start: number, end: number): number {
  let value = 0;
  for (let i = start; i < end; i++) value = value * 256 + (buf[i] ?? 0);
  return value;
}

// ---------------------------------------------------------------- EBML writing

function encodeSize(value: number): Buffer {
  for (let length = 1; length <= 8; length++) {
    // An all-ones value means "unknown size", so it can't be used as a length.
    if (value >= 2 ** (7 * length) - 1) continue;
    const out = Buffer.alloc(length);
    let rest = value;
    for (let i = length - 1; i >= 0; i--) {
      out[i] = rest % 256;
      rest = Math.floor(rest / 256);
    }
    out[0] = (out[0] ?? 0) | (0x80 >> (length - 1));
    return out;
  }
  throw new Error(`element too large: ${value}`);
}

function encodeId(id: number): Buffer {
  const bytes: number[] = [];
  for (let value = id; value > 0; value = Math.floor(value / 256)) bytes.unshift(value % 256);
  return Buffer.from(bytes);
}

function element(id: number, payload: Buffer): Buffer {
  return Buffer.concat([encodeId(id), encodeSize(payload.length), payload]);
}

function uintElement(id: number, value: number): Buffer {
  const bytes: number[] = [];
  let rest = value;
  do {
    bytes.unshift(rest % 256);
    rest = Math.floor(rest / 256);
  } while (rest > 0);
  return element(id, Buffer.from(bytes));
}

function floatElement(id: number, value: number): Buffer {
  const payload = Buffer.alloc(8);
  payload.writeDoubleBE(value);
  return element(id, payload);
}

// --------------------------------------------------------------------- parsing

function readWebm(buf: Buffer): Webm {
  const top = [...children(buf, 0, buf.length)];
  const ebml = top.find((e) => e.id === ID.EBML);
  const segment = top.find((e) => e.id === ID.Segment);
  if (!ebml || !segment) throw new Error('not a webm file');

  let info: Element | null = null;
  let tracks: Element | null = null;
  const frames: Frame[] = [];

  for (const child of children(buf, segment.dataStart, segment.dataEnd)) {
    if (child.id === ID.Info) {
      info = child;
    } else if (child.id === ID.Tracks) {
      tracks = child;
    } else if (child.id === ID.Cluster) {
      let clusterTime = 0;
      for (const field of children(buf, child.dataStart, child.dataEnd)) {
        if (field.id === ID.Timecode) {
          clusterTime = uint(buf, field.dataStart, field.dataEnd);
        } else if (field.id === ID.SimpleBlock) {
          const track = readSize(buf, field.dataStart);
          const relStart = field.dataStart + track.length;
          frames.push({
            time: clusterTime + buf.readInt16BE(relStart),
            keyframe: ((buf[relStart + 2] ?? 0) & 0x80) !== 0,
            bytes: field.dataEnd - (relStart + 3),
            block: buf.subarray(field.dataStart, field.dataEnd),
            trackLength: track.length,
          });
        }
      }
    }
  }

  if (!info || !tracks) throw new Error('webm has no Info or Tracks');
  if (frames.length === 0) throw new Error('webm has no frames');
  return { buf, ebml, info, tracks, frames };
}

/** The recording's frame interval in ms — the commonest gap between frames. */
function frameStep(frames: Frame[]): number {
  const counts = new Map<number, number>();
  for (let i = 1; i < Math.min(frames.length, 200); i++) {
    const delta = (frames[i]?.time ?? 0) - (frames[i - 1]?.time ?? 0);
    if (delta > 0) counts.set(delta, (counts.get(delta) ?? 0) + 1);
  }
  let best = 40;
  let seen = 0;
  for (const [delta, count] of counts) {
    if (count > seen) {
      best = delta;
      seen = count;
    }
  }
  return best;
}

// -------------------------------------------------------------------- trimming

/**
 * Drop the film before `startMs`. With no mark, drops the opening run of
 * unchanging frames instead — better than nothing for a spec that never puts
 * an overlay up. Returns null when there is nothing worth cutting.
 */
export function trimTo(buf: Buffer, startMs: number | null): TrimResult | null {
  const webm = readWebm(buf);
  const { frames } = webm;
  const step = frameStep(frames);

  // Open on the last keyframe at or before the mark — an inter frame can't
  // start a stream, so this is as tight as a cut can be without re-encoding.
  let anchor = 0;
  if (startMs !== null && startMs > 0) {
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (!frame || frame.time > startMs) break;
      if (frame.keyframe) anchor = i;
    }
  }

  // Whatever is still after the anchor changed nothing, so it can go too.
  let resume = anchor + 1;
  while ((frames[resume]?.bytes ?? Infinity) <= STILL_FRAME_BYTES) resume++;
  const first = frames[anchor];
  const next = frames[resume];
  if (!first || !next) return null;

  const shift = next.time - step;
  if (shift < MIN_TRIM_MS) return null;

  const kept: Frame[] = [
    { ...first, time: 0 },
    ...frames.slice(resume).map((f) => ({ ...f, time: f.time - shift })),
  ];

  return {
    buffer: writeWebm(webm, kept, step),
    trimmedMs: shift,
    durationMs: (kept[kept.length - 1]?.time ?? 0) + step,
    droppedFrames: frames.length - kept.length,
  };
}

function writeWebm(webm: Webm, frames: Frame[], step: number): Buffer {
  const { buf } = webm;

  // Info verbatim but for the duration, which the cut has changed.
  const durationMs = (frames[frames.length - 1]?.time ?? 0) + step;
  const infoParts: Buffer[] = [];
  for (const field of children(buf, webm.info.dataStart, webm.info.dataEnd)) {
    if (field.id !== ID.Duration) infoParts.push(buf.subarray(field.start, field.dataEnd));
  }
  infoParts.push(floatElement(ID.Duration, durationMs));
  const info = element(ID.Info, Buffer.concat(infoParts));
  const tracks = buf.subarray(webm.tracks.start, webm.tracks.dataEnd);

  // One cluster per keyframe, which is how the recorder wrote them.
  const clusters: { time: number; buffer: Buffer }[] = [];
  let blocks: Buffer[] = [];
  let clusterTime = 0;
  const flush = () => {
    if (blocks.length === 0) return;
    clusters.push({
      time: clusterTime,
      buffer: element(ID.Cluster, Buffer.concat([uintElement(ID.Timecode, clusterTime), ...blocks])),
    });
    blocks = [];
  };
  for (const frame of frames) {
    if (frame.keyframe && blocks.length > 0) flush();
    if (blocks.length === 0) clusterTime = frame.time;
    const block = Buffer.from(frame.block);
    block.writeInt16BE(frame.time - clusterTime, frame.trackLength);
    blocks.push(element(ID.SimpleBlock, block));
  }
  flush();

  // Cues point at each cluster, offset from the start of the segment's data;
  // without them a browser can only seek by scanning.
  let offset = info.length + tracks.length;
  const cuePoints: Buffer[] = [];
  for (const cluster of clusters) {
    cuePoints.push(
      element(
        ID.CuePoint,
        Buffer.concat([
          uintElement(ID.CueTime, cluster.time),
          element(
            ID.CueTrackPositions,
            Buffer.concat([uintElement(ID.CueTrack, 1), uintElement(ID.CueClusterPosition, offset)]),
          ),
        ]),
      ),
    );
    offset += cluster.buffer.length;
  }

  return Buffer.concat([
    buf.subarray(webm.ebml.start, webm.ebml.dataEnd),
    element(
      ID.Segment,
      Buffer.concat([info, tracks, ...clusters.map((c) => c.buffer), element(ID.Cues, Buffer.concat(cuePoints))]),
    ),
  ]);
}

/** Trim a recording in place. Returns what was cut, or null if nothing was. */
export function trimRecording(path: string, startMs: number | null): TrimResult | null {
  const result = trimTo(readFileSync(path), startMs);
  if (result) writeFileSync(path, result.buffer);
  return result;
}
