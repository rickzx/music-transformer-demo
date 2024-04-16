/**
 * The vocabularies used for arrival-time and interarrival-time encodings.
 * 
 * From https://github.com/jthickstun/anticipation/blob/main/anticipation/sample.py.
 */


// training sequence vocab

import * as config from "./music_transformer_config"

// the event block
export const EVENT_OFFSET = 0
export const TIME_OFFSET = EVENT_OFFSET // 0
export const DUR_OFFSET = TIME_OFFSET + config.MAX_TIME // 10000
export const NOTE_OFFSET = DUR_OFFSET + config.MAX_DUR // 11000
export const REST = NOTE_OFFSET + config.MAX_NOTE // 27512

// the control block
export const CONTROL_OFFSET = NOTE_OFFSET + config.MAX_NOTE + 1 // 27513
export const ATIME_OFFSET = CONTROL_OFFSET + 0 // 27513
export const ADUR_OFFSET = ATIME_OFFSET + config.MAX_TIME // 37513
export const ANOTE_OFFSET = ADUR_OFFSET + config.MAX_DUR // 38513

// the special block
export const SPECIAL_OFFSET = ANOTE_OFFSET + config.MAX_NOTE // 55025
export const SEPARATOR = SPECIAL_OFFSET
export const AUTOREGRESS = SPECIAL_OFFSET + 1 // 55026
export const ANTICIPATE = SPECIAL_OFFSET + 2 // 55027
export const VOCAB_SIZE = ANTICIPATE + 1 // 55028

// interarrival - time(MIDI - like) vocab
export const MIDI_TIME_OFFSET = 0
export const MIDI_START_OFFSET = MIDI_TIME_OFFSET + config.MAX_INTERARRIVAL
export const MIDI_END_OFFSET = MIDI_START_OFFSET + config.MAX_NOTE
export const MIDI_SEPARATOR = MIDI_END_OFFSET + config.MAX_NOTE
export const MIDI_VOCAB_SIZE = MIDI_SEPARATOR + 1
