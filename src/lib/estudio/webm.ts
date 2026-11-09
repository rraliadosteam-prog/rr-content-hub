// Empaquetador WebM (Matroska) mínimo y sin dependencias.
// Recibe los fragmentos ya codificados por WebCodecs (VideoEncoder / AudioEncoder)
// y arma un archivo .webm reproducible por los navegadores.

export interface EncodedBlock {
  data: Uint8Array;
  timestampMs: number;
  key: boolean;
  track: 1 | 2;
}

export interface MuxOptions {
  width: number;
  height: number;
  videoCodec: "V_VP9" | "V_VP8";
  audioCodec?: "A_OPUS";
  audioSampleRate?: number;
  audioChannels?: number;
  durationMs: number;
}

const ID = {
  EBML: 0x1a45dfa3,
  EBMLVersion: 0x4286,
  EBMLReadVersion: 0x42f7,
  EBMLMaxIDLength: 0x42f2,
  EBMLMaxSizeLength: 0x42f3,
  DocType: 0x4282,
  DocTypeVersion: 0x4287,
  DocTypeReadVersion: 0x4285,
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  MuxingApp: 0x4d80,
  WritingApp: 0x5741,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackUID: 0x73c5,
  TrackType: 0x83,
  FlagLacing: 0x9c,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Audio: 0xe1,
  SamplingFrequency: 0xb5,
  Channels: 0x9f,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
  CueTime: 0xb3,
  CueTrackPositions: 0xb7,
  CueTrack: 0xf7,
  CueClusterPosition: 0xf1,
  SeekHead: 0x114d9b74,
  Seek: 0x4dbb,
  SeekID: 0x53ab,
  SeekPosition: 0x53ac,
} as const;

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function vintLength(value: number): number {
  for (let len = 1; len <= 8; len++) {
    const max = Math.pow(2, 7 * len) - 2;
    if (value <= max) return len;
  }
  return 8;
}

/** Entero de longitud variable (EBML) con bit de marca. */
function encodeVint(value: number): Uint8Array {
  const len = vintLength(value);
  const bytes = new Uint8Array(len);
  let v = value;
  for (let i = len - 1; i >= 0; i--) {
    bytes[i] = v % 256;
    v = Math.floor(v / 256);
  }
  bytes[0] |= 1 << (8 - len);
  return bytes;
}

function idBytes(id: number): Uint8Array {
  const bytes: number[] = [];
  let v = id;
  while (v > 0) {
    bytes.unshift(v % 256);
    v = Math.floor(v / 256);
  }
  return new Uint8Array(bytes);
}

function uintBytes(value: number): Uint8Array {
  if (value === 0) return new Uint8Array([0]);
  const bytes: number[] = [];
  let v = value;
  while (v > 0) {
    bytes.unshift(v % 256);
    v = Math.floor(v / 256);
  }
  return new Uint8Array(bytes);
}

function floatBytes(value: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value, false);
  return new Uint8Array(buf);
}

function strBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function element(id: number, payload: Uint8Array): Uint8Array {
  return concat([idBytes(id), encodeVint(payload.length), payload]);
}

function uintEl(id: number, value: number): Uint8Array {
  return element(id, uintBytes(value));
}

function strEl(id: number, value: string): Uint8Array {
  return element(id, strBytes(value));
}

function floatEl(id: number, value: number): Uint8Array {
  return element(id, floatBytes(value));
}

function opusHead(channels: number, sampleRate: number): Uint8Array {
  const head = new Uint8Array(19);
  head.set(strBytes("OpusHead"), 0);
  head[8] = 1;
  head[9] = channels;
  head[10] = 3840 & 0xff;
  head[11] = (3840 >> 8) & 0xff;
  head[12] = sampleRate & 0xff;
  head[13] = (sampleRate >> 8) & 0xff;
  head[14] = (sampleRate >> 16) & 0xff;
  head[15] = (sampleRate >> 24) & 0xff;
  head[16] = 0;
  head[17] = 0;
  head[18] = 0;
  return head;
}

function simpleBlock(block: EncodedBlock, clusterTimecode: number): Uint8Array {
  const rel = Math.round(block.timestampMs - clusterTimecode);
  const relBytes = new Uint8Array(2);
  const clamped = Math.max(-32768, Math.min(32767, rel));
  relBytes[0] = (clamped >> 8) & 0xff;
  relBytes[1] = clamped & 0xff;
  const flags = new Uint8Array([block.key ? 0x80 : 0x00]);
  return element(ID.SimpleBlock, concat([encodeVint(block.track), relBytes, flags, block.data]));
}

/** Arma el archivo WebM y lo devuelve como Blob descargable. */
export function muxWebM(video: EncodedBlock[], audio: EncodedBlock[], opts: MuxOptions): Blob {
  const header = element(
    ID.EBML,
    concat([
      uintEl(ID.EBMLVersion, 1),
      uintEl(ID.EBMLReadVersion, 1),
      uintEl(ID.EBMLMaxIDLength, 4),
      uintEl(ID.EBMLMaxSizeLength, 8),
      strEl(ID.DocType, "webm"),
      uintEl(ID.DocTypeVersion, 2),
      uintEl(ID.DocTypeReadVersion, 2),
    ]),
  );

  const info = element(
    ID.Info,
    concat([
      uintEl(ID.TimecodeScale, 1000000),
      strEl(ID.MuxingApp, "RR Estudio"),
      strEl(ID.WritingApp, "RR Estudio"),
      floatEl(ID.Duration, opts.durationMs),
    ]),
  );

  const trackEntries: Uint8Array[] = [
    element(
      ID.TrackEntry,
      concat([
        uintEl(ID.TrackNumber, 1),
        uintEl(ID.TrackUID, 1),
        uintEl(ID.TrackType, 1),
        uintEl(ID.FlagLacing, 0),
        strEl(ID.CodecID, opts.videoCodec),
        element(
          ID.Video,
          concat([uintEl(ID.PixelWidth, opts.width), uintEl(ID.PixelHeight, opts.height)]),
        ),
      ]),
    ),
  ];

  if (opts.audioCodec === "A_OPUS" && audio.length) {
    trackEntries.push(
      element(
        ID.TrackEntry,
        concat([
          uintEl(ID.TrackNumber, 2),
          uintEl(ID.TrackUID, 2),
          uintEl(ID.TrackType, 2),
          uintEl(ID.FlagLacing, 0),
          strEl(ID.CodecID, "A_OPUS"),
          element(ID.CodecPrivate, opusHead(opts.audioChannels ?? 2, opts.audioSampleRate ?? 48000)),
          element(
            ID.Audio,
            concat([
              floatEl(ID.SamplingFrequency, opts.audioSampleRate ?? 48000),
              uintEl(ID.Channels, opts.audioChannels ?? 2),
            ]),
          ),
        ]),
      ),
    );
  }

  const tracks = element(ID.Tracks, concat(trackEntries));

  // Agrupa los bloques en clústeres de hasta 4 segundos.
  const blocks = [...video, ...audio].sort((a, b) => a.timestampMs - b.timestampMs);
  const clusters: Uint8Array[] = [];
  const cuePoints: Uint8Array[] = [];
  let current: EncodedBlock[] = [];
  let clusterTimecode = 0;
  let position = 0;

  const flush = () => {
    if (!current.length) return;
    const payload: Uint8Array[] = [uintEl(ID.Timecode, clusterTimecode)];
    for (const b of current) payload.push(simpleBlock(b, clusterTimecode));
    const cluster = element(ID.Cluster, concat(payload));
    cuePoints.push(
      element(
        ID.CuePoint,
        concat([
          uintEl(ID.CueTime, clusterTimecode),
          element(
            ID.CueTrackPositions,
            concat([
              uintEl(ID.CueTrack, current[0].track),
              uintEl(ID.CueClusterPosition, position),
            ]),
          ),
        ]),
      ),
    );
    clusters.push(cluster);
    position += cluster.length;
    current = [];
  };

  for (const b of blocks) {
    if (!current.length) {
      clusterTimecode = Math.floor(b.timestampMs / 1000) * 1000;
    } else if (b.timestampMs - clusterTimecode > 4000) {
      flush();
      clusterTimecode = Math.floor(b.timestampMs / 1000) * 1000;
    }
    current.push(b);
  }
  flush();

  const cues = element(ID.Cues, concat(cuePoints));

  const segmentPayload = concat([info, tracks, ...clusters, cues]);
  const segment = element(ID.Segment, segmentPayload);
  const file = concat([header, segment]);
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  return new Blob([buffer], { type: "video/webm" });
}
