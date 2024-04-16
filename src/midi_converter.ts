/**
 * Convert raw data to notes data.
 * Raw output is a sequence of triplet  time, duration, and note (t, d, n).
 * Note n combines pitch p and instrument k using a single value n = 128k + p.
 */
import MidiWriter from 'midi-writer-js'; // https://grimmdude.com/MidiWriterJS/docs/modules.html
import { MAX_PITCH } from './music_transformer_config'
import { DUR_OFFSET, NOTE_OFFSET, CONTROL_OFFSET, REST } from './music_transformer_vocab';

const NOTE_ON_VELOCITY = 56.25

function offset(num) {
  if (num >= CONTROL_OFFSET) return num - CONTROL_OFFSET;
  return num;
}

function unpad(tokens: number[]): number[] {
  const newTokens: number[] = [];
  for (let i = 0; i < tokens.length; i += 3) {
      const time = tokens[i];
      const dur = tokens[i + 1];
      const note = tokens[i + 2];
      if (note === REST) continue;

      newTokens.push(time, dur, note);
  }
  return newTokens;
}

/**
 * Convert each triplet in raw data into a note with 5 pieces of info. 
 * Conversion method see github.com/jthickstun/anticipation/blob/main/anticipation/convert.py.
 * Output is a list of list of numbers, where each inner list is a note formatted as 
 * [start, duration, pitch, instrument, velocity]. Start time and duration in unit of seconds.
 */
export function eventsToCompound(rawData: number[], start_offset: number = 0): number[][] {
  const unpadData = unpad(rawData);
  const notesData: number[][] = [];

  /* Iterate through each 3 note triplet. */
  for (let i = 0; i < unpadData.length; i += 3) {
    const start = offset(unpadData[i]) + start_offset;
    const duration = offset(unpadData[i + 1]) - DUR_OFFSET;
    const pitch = (offset(unpadData[i + 2]) - NOTE_OFFSET) % MAX_PITCH;
    const instrument = Math.floor((offset(unpadData[i + 2]) - NOTE_OFFSET) / MAX_PITCH);
    notesData.push([start, duration, pitch, instrument, NOTE_ON_VELOCITY]);
  }

  return notesData;
}

export function compoundToMidi(notesData: number[][]): string {
  /**
   * Create one midi track for each instrument.
   * Output map key/pair set: <Instrument midi class, track for that instrument >.
   */
  var num_tracks = 0
  const instruMap = new Map<number, [any, number]>();
  for (let i = 0; i < notesData.length; i++) {
    const [start, duration, pitch, instrument, velocity] = notesData[i];

    /* If we get encounter a new instrument, add a new MIDI track for it. */
    if (!instruMap.has(instrument)) {
      var idx: number = num_tracks;
      const track = new MidiWriter.Track();
      if (instrument == 128) { // drums always go on channel 9
        idx = 9;
        track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 0, channel: idx }));
      } else {
        track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instrument, channel: idx }));
      }
      instruMap.set(instrument, [track, idx]);
      num_tracks += 1
      if (num_tracks == 9) {
        num_tracks += 1 // skip the drums track
      }
    }
    
    const elem = instruMap.get(instrument);
    if (elem === undefined) {
      throw Error("Shouldn't happen!");
    }
    const track = elem[0];
    const channel = elem[1];
    // https://github.com/grimmdude/MidiWriterJS/blob/master/src/midi-events/note-event.ts
    // Note event channel is 1-based
    const note = new MidiWriter.NoteEvent({
      pitch: pitch, velocity: velocity,
      tick: start, duration: `T${duration}`,
      channel: channel + 1
    });
    track.addEvent(note);
  }

  const midi = Array.from(instruMap.values()).map(v => v[0]);
  /* Download file. */
  const writer = new MidiWriter.Writer(midi);
  return writer.dataUri();
}