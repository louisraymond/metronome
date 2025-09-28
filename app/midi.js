const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const TEMPO_META = 0x51;
const TIME_SIG_META = 0x58;

const readString = (view, offset, len) => {
  let out = '';
  for (let i = 0; i < len; i++) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
};

const readUint32 = (view, offset) => view.getUint32(offset, false);
const readUint16 = (view, offset) => view.getUint16(offset, false);

const readVarLen = (view, start) => {
  let result = 0;
  let offset = start;
  while (true) {
    const byte = view.getUint8(offset);
    result = (result << 7) | (byte & 0x7f);
    offset++;
    if ((byte & 0x80) === 0) break;
  }
  return { value: result, offset };
};

const midiCommandLength = (command) => {
  const hi = command & 0xf0;
  if (hi === 0xc0 || hi === 0xd0) return 1;
  return 2;
};

export function parseMidiFile(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer)) throw new Error('Expected ArrayBuffer');
  const view = new DataView(arrayBuffer);
  let offset = 0;

  const headerId = readString(view, offset, 4);
  if (headerId !== 'MThd') throw new Error('Invalid MIDI file: missing header');
  const headerSize = readUint32(view, offset + 4);
  if (headerSize !== 6) throw new Error('Unsupported MIDI header length');
  const format = readUint16(view, offset + 8);
  const tracks = readUint16(view, offset + 10);
  const division = readUint16(view, offset + 12);
  offset += 8 + headerSize;

  if (division & 0x8000) throw new Error('SMPTE time formats are not supported');
  const ticksPerBeat = division;

  const rawEvents = [];
  let eventCounter = 0;
  const timeSignatures = [];

  for (let trackIndex = 0; trackIndex < tracks; trackIndex++) {
    if (offset + 8 > view.byteLength) throw new Error('Unexpected end of file while reading track header');
    const chunkId = readString(view, offset, 4);
    const chunkSize = readUint32(view, offset + 4);
    offset += 8;
    if (chunkId !== 'MTrk') {
      offset += chunkSize;
      continue;
    }
    const trackEnd = offset + chunkSize;
    let runningStatus = null;
    let absoluteTicks = 0;

    while (offset < trackEnd) {
      const delta = readVarLen(view, offset);
      absoluteTicks += delta.value;
      offset = delta.offset;
      if (offset >= trackEnd) break;
      let statusByte = view.getUint8(offset);
      if (statusByte < 0x80) {
        if (runningStatus === null) throw new Error('Invalid running status in MIDI track');
        statusByte = runningStatus;
      } else {
        offset++;
        runningStatus = statusByte;
      }

      if (statusByte === 0xff) {
        if (offset >= trackEnd) break;
        const type = view.getUint8(offset);
        offset++;
        const lengthInfo = readVarLen(view, offset);
        const dataLength = lengthInfo.value;
        offset = lengthInfo.offset;
        if (type === TEMPO_META && dataLength === 3) {
          const microseconds =
            (view.getUint8(offset) << 16) | (view.getUint8(offset + 1) << 8) | view.getUint8(offset + 2);
          rawEvents.push({
            kind: 'tempo',
            ticks: absoluteTicks,
            microsecondsPerQuarter: microseconds,
            order: eventCounter++,
          });
        } else if (type === TIME_SIG_META && dataLength >= 2) {
          const numerator = view.getUint8(offset);
          const denomPow = view.getUint8(offset + 1);
          const denominator = 2 ** denomPow;
          timeSignatures.push({ ticks: absoluteTicks, numerator, denominator });
        }
        offset += dataLength;
        continue;
      }

      if (statusByte === 0xf0 || statusByte === 0xf7) {
        const lengthInfo = readVarLen(view, offset);
        const dataLength = lengthInfo.value;
        offset = lengthInfo.offset + dataLength;
        continue;
      }

      const command = statusByte & 0xf0;
      const channel = statusByte & 0x0f;
      const dataLen = midiCommandLength(statusByte);
      if (offset + dataLen > trackEnd) {
        offset = trackEnd;
        break;
      }
      const data1 = view.getUint8(offset);
      const data2 = dataLen > 1 ? view.getUint8(offset + 1) : 0;
      offset += dataLen;

      if (command === NOTE_ON) {
        if (data2 === 0) {
          rawEvents.push({ kind: 'noteOff', ticks: absoluteTicks, note: data1, channel, order: eventCounter++ });
        } else {
          rawEvents.push({
            kind: 'noteOn',
            ticks: absoluteTicks,
            note: data1,
            velocity: data2,
            channel,
            order: eventCounter++,
          });
        }
      } else if (command === NOTE_OFF) {
        rawEvents.push({ kind: 'noteOff', ticks: absoluteTicks, note: data1, channel, order: eventCounter++ });
      }
    }

    offset = trackEnd;
  }

  if (rawEvents.length === 0) {
    return { notes: [], duration: 0, ticksPerBeat };
  }

  rawEvents.sort((a, b) => {
    if (a.ticks === b.ticks) return a.order - b.order;
    return a.ticks - b.ticks;
  });

  const notes = [];
  const active = new Map();
  let tempo = 500000; // Default 120 BPM
  let lastTicks = 0;
  let seconds = 0;
  let maxTicks = 0;

  for (const event of rawEvents) {
    const deltaTicks = event.ticks - lastTicks;
    if (deltaTicks > 0) {
      seconds += (deltaTicks / ticksPerBeat) * (tempo / 1_000_000);
      lastTicks = event.ticks;
    }

    if (event.kind === 'tempo') {
      tempo = event.microsecondsPerQuarter;
      continue;
    }

    const key = `${event.channel}:${event.note}`;
    if (event.kind === 'noteOn') {
      active.set(key, {
        note: event.note,
        velocity: event.velocity ?? 0,
        startSeconds: seconds,
        startTicks: event.ticks,
      });
    } else if (event.kind === 'noteOff') {
      const start = active.get(key);
      if (start) {
        const duration = Math.max(0.05, seconds - start.startSeconds || 0.05);
        const durationTicks = Math.max(1, event.ticks - start.startTicks || 0);
        const endTicks = start.startTicks + durationTicks;
        notes.push({
          note: event.note,
          velocity: start.velocity,
          start: start.startSeconds,
          duration,
          startBeats: ticksPerBeat > 0 ? start.startTicks / ticksPerBeat : 0,
          durationBeats: ticksPerBeat > 0 ? durationTicks / ticksPerBeat : duration / (tempo / 1_000_000),
          endTicks,
        });
        if (endTicks > maxTicks) maxTicks = endTicks;
        active.delete(key);
      }
    }
  }

  if (active.size > 0) {
    for (const value of active.values()) {
      const defaultDuration = 0.5;
      const durationTicks = Math.max(1, Math.round((ticksPerBeat || 96) * 0.5));
      const endTicks = (value.startTicks || 0) + durationTicks;
      notes.push({
        note: value.note,
        velocity: value.velocity,
        start: value.startSeconds,
        duration: defaultDuration,
        startBeats: ticksPerBeat > 0 ? value.startTicks / ticksPerBeat : 0,
        durationBeats:
          ticksPerBeat > 0 ? Math.max(0.25, durationTicks / ticksPerBeat) : Math.max(0.25, defaultDuration / (tempo / 1_000_000)),
        endTicks,
      });
      if (endTicks > maxTicks) maxTicks = endTicks;
    }
  }

  notes.sort((a, b) => a.start - b.start);
  const duration = notes.length ? Math.max(...notes.map((n) => n.start + n.duration)) : 0;
  maxTicks = Math.max(maxTicks, lastTicks);
  const totalBeats = ticksPerBeat > 0 ? maxTicks / ticksPerBeat : 0;
  const primaryTimeSig = timeSignatures.length
    ? { numerator: timeSignatures[0].numerator || 4, denominator: timeSignatures[0].denominator || 4 }
    : { numerator: 4, denominator: 4 };
  const beatsPerBar = primaryTimeSig.denominator
    ? primaryTimeSig.numerator * (4 / primaryTimeSig.denominator)
    : 0;
  const barEstimate = beatsPerBar > 0 ? totalBeats / beatsPerBar : 0;

  return {
    notes,
    duration,
    ticksPerBeat,
    totalBeats,
    barEstimate,
    timeSignature: primaryTimeSig,
  };
}
