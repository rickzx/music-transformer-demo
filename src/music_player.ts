/* Doc for Music Player: https://magenta.github.io/magenta-js/music */
// import * as midis from './asset/*.mid';
import * as mm from "@magenta/music/esm/core.js";
import * as midis from "url:./assets/*.mid";
import * as mt from "./music_transformer.ts";
import { MIDILoader } from "./midi_loader.ts";
import { tensorflow } from "@magenta/music/esm/protobuf/proto";
import { GenerationConfig } from "@mlc-ai/web-llm";

var log_flag = true;

/**
 * Log message if in log mode.
 */
function log(msg: string) {
  if (log_flag) {
    const logElement = document.getElementById("log");
    if (logElement) {
      logElement.innerHTML += msg;
    }
  }
}

/**
 * Download MIDI file.
 */
async function download() {
  var player = document.getElementById("midi-player");
  var download_file = document.createElement("a");
  download_file.href = player.src;
  download_file.download = "demo.mid";
  download_file.click();
  download_file.remove();
  log(`MIDI file ${player.src} downloaded.<br>`);
}

/**
 * Reload the MIDI player.
 */
async function reload() {
  var player = document.getElementById("midi-player");
  var visualizer = document.getElementById("midi-visualizer");
  player.stop();
  player.reload();
  visualizer.reload();
  log("MIDI player reloaded.<br>");
}

/**
 * Change the MIDI file being played
 */
async function update_midi(midi_src: string | Blob, midi_name: string) {
  var player = document.getElementById("midi-player");
  var visualizer = document.getElementById("midi-visualizer");
  player.src = midi_src;

  let ns: tensorflow.magenta.NoteSequence;
  if (typeof midi_src === "string") {
    ns = await mm.urlToNoteSequence(midi_src);
  } else {
    ns = await mm.blobToNoteSequence(midi_src);
  }

  player.noteSequence = ns;
  visualizer.noteSequence = ns;
  reload();
}

/**
 * Move the timestamp to 60 seconds and start playing from it.
 */
async function move() {
  var player = document.getElementById("midi-player");
  if (player.playing) {
    player.stop();
  }
  player.currentTime = 60;
  player.start();
  log(`Current playback position moved to 60s. <br>`);
}

async function main() {
  const startButton = document.getElementById("startButton");
  const pauseButton = document.getElementById("pauseButton");
  const resetButton = document.getElementById("resetButton");
  startButton!.disabled = true;
  pauseButton!.disabled = true;
  resetButton!.disabled = true;

  const temperature_slider = document.getElementById("temperature")!;
  const temperature_value = document.getElementById("temperature-value")!;

  const top_p_slider = document.getElementById("topP")!;
  const top_p_value = document.getElementById("topP-value")!;

  const frequency_penalty_slider = document.getElementById("frequencyPenalty")!;
  const frequency_penalty_value = document.getElementById("frequencyPenalty-value")!;

  let genConfig: GenerationConfig = {
    temperature: parseFloat(temperature_value.innerHTML),
    top_p: parseFloat(top_p_value.innerHTML),
    frequency_penalty: parseFloat(frequency_penalty_value.innerHTML),
  };

  temperature_slider.oninput = function () {
    temperature_value.innerHTML = (this as HTMLInputElement).value;
    genConfig.temperature = parseFloat((this as HTMLInputElement).value);
  };

  top_p_slider.oninput = function () {
    top_p_value.innerHTML = (this as HTMLInputElement).value;
    genConfig.top_p = parseFloat((this as HTMLInputElement).value);
  };

  frequency_penalty_slider.oninput = function () {
    frequency_penalty_value.innerHTML = (this as HTMLInputElement).value;
    genConfig.frequency_penalty = parseFloat((this as HTMLInputElement).value);
  };

  update_midi(midis["tchai"], "Grieg");
  const chat = await mt.initChat();
  const midi_loader = new MIDILoader();

  startButton!.disabled = false;
  pauseButton!.disabled = false;
  resetButton!.disabled = false;

  log("Web-LLM Chat loaded <br>");
  let generationStopped = true;

  if (startButton) {
    startButton.addEventListener("click", async () => {
      generationStopped = false;

      while (!generationStopped) {
        log("Starting generator <br>");
        const tokens = (await chat.chunkGenerate(genConfig))
          .split(",")
          .map((str) => parseInt(str));
        console.log("UI: received generated tokens: ");
        console.log(tokens);
        log((await chat.runtimeStatsText()) + "<br>");
        midi_loader.addEventTokens(tokens);
        update_midi(midi_loader.getMIDIData(), "infinite_music");
      }
    });
  }

  if (pauseButton) {
    pauseButton.addEventListener("click", async () => {
      generationStopped = true;
      log("Pausing generator <br>");
    });
  }

  if (resetButton) {
    resetButton.addEventListener("click", async () => {
      generationStopped = true;
      log("Reset generator <br>");
      await chat.resetChat();
      await chat.resetGenerator();
      midi_loader.reset();
    });
  }

  // const switchButton = document.getElementById("switchButton");
  // const moveButton = document.getElementById("moveButton");
  // const convertButton = document.getElementById("convertButton");

  // if (switchButton) {
  //   switchButton.addEventListener("click", async () => {
  //     change(midis["tchai"], 'Tchaikovsky');
  //   });
  // }

  // if (moveButton) {
  //   moveButton.addEventListener("click", async () => {
  //     move();
  //   });
  // }

  // if (convertButton) {
  //   convertButton.addEventListener("click", async () => {
  //     const notesData = converter.eventsToCompound([0, 10048, 11060, 50, 10048, 11060,
  //       100, 10048, 11067, 150, 10048, 11067, 200, 10048, 11069, 250, 10048, 11069,
  //       300, 10095, 11067, 400, 10048, 11065, 450, 10048, 11065, 500, 10048, 11064,
  //       550, 10048, 11064, 600, 10048, 11062, 650, 10048, 11062, 700, 10095, 11060]);
  //     console.log(notesData);
  //     converter.compoundToMidi(notesData);
  //   });
  // }
}

main();
