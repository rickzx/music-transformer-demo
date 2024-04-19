/* Doc for Music Player: https://magenta.github.io/magenta-js/music */
// import * as midis from './asset/*.mid';
import * as mm from "@magenta/music/esm/core.js";
import * as midis from "url:./assets/*.mid";
import * as mt from "./music_transformer.ts";
import { MIDILoader } from "./midi_loader.ts";
import { tensorflow } from "@magenta/music/esm/protobuf/proto";
import { GenerationConfig } from "@mlc-ai/web-llm";

let log_flag = true;
let current_midi_url;

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
  var download_file = document.createElement("a");
  download_file.href = current_midi_url;
  download_file.download = "infinite_music.mid";
  download_file.click();
  download_file.remove();
  log(`MIDI file downloaded.<br>`);
}

/**
 * Change the MIDI file being played
 */
async function update_midi(midi_src: string) {
  var player = document.getElementById("midi-player");
  var visualizer = document.getElementById("midi-visualizer");
  const currTime = player.currentTime ? player.currentTime : 0;
  const isPlaying = player.playing;

  let ns: tensorflow.magenta.NoteSequence;
  ns = await mm.urlToNoteSequence(midi_src);
  current_midi_url = midi_src;

  player.noteSequence = ns;
  visualizer.noteSequence = ns;

  if (isPlaying) {
    setTimeout(() => {
      const seek_bar = player?.shadowRoot?.querySelector(".seek-bar");
      seek_bar.value = currTime;
      seek_bar.dispatchEvent(new Event("change"));
      player?.shadowRoot?.querySelector(".play")?.click();
    }, 1000);
  }
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

function getModelId(model: string): string {
  if (model === "small") {
    return "music-small-800k-q0f32";
  } else if (model === "medium") {
    return "music-medium-800k-q0f32";
  }
  return "music-small-800k-q0f32";
}

async function main() {
  // Disable buttons before Web-LLM is fully loaded
  let chat: mt.CustomChatWorkerClient;

  const startButton = document.getElementById("startButton") as HTMLButtonElement;
  const pauseButton = document.getElementById("pauseButton") as HTMLButtonElement;
  const resetButton = document.getElementById("resetButton") as HTMLButtonElement;
  const downloadMidiButton = document.getElementById("downloadMidiButton") as HTMLButtonElement;

  startButton.disabled = true;
  pauseButton.disabled = true;
  resetButton.disabled = true;

  /*************************** Managing Download ********************************/
  update_midi(midis["tchai"]);
  const midi_loader = new MIDILoader();

  if (downloadMidiButton) {
    downloadMidiButton.addEventListener("click", async () => {
      await download();
    });
  }

  /*************************** Control Panel Configurations ********************************/

  const dropdown = document.getElementById("modelSize") as HTMLSelectElement;

  const temperature_slider = document.getElementById("temperature")!;
  const temperature_value = document.getElementById("temperature-value")!;

  const top_p_slider = document.getElementById("topP")!;
  const top_p_value = document.getElementById("topP-value")!;

  const frequency_penalty_slider = document.getElementById("frequencyPenalty")!;
  const frequency_penalty_value = document.getElementById(
    "frequencyPenalty-value"
  )!;

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

  /*************************** Model selection ********************************/
  let selectedModel;
  let model_id;
  const reloadModelButton = document.getElementById("reloadButton")!;

  if (dropdown) {
    selectedModel = dropdown.value;
    model_id = getModelId(selectedModel);
    dropdown.addEventListener("change", (event) => {
      selectedModel = (event.target as HTMLSelectElement).value;
      model_id = getModelId(selectedModel);
    });
  }

  reloadModelButton.addEventListener("click", async () => {
    startButton.disabled = true;
    pauseButton.disabled = true;
    resetButton.disabled = true;
    
    generationStopped = true;
    await chat.stopGenerator();
    await chat.resetChat();
    await chat.resetGenerator();
    midi_loader.reset();
    generating = false;
    savedTokens = undefined;

    await mt.reloadChat(chat, model_id);
    startButton.disabled = false;
    pauseButton.disabled = false;
    resetButton.disabled = false;

    log(`Web-LLM Chat reloaded with model: ${model_id} <br>`)
  });

  /*************************** Init Web-LLM Chat and MIDI visualizer ********************************/
  chat = await mt.initChat(model_id);

  startButton.disabled = false;
  pauseButton.disabled = false;
  resetButton.disabled = false;

  log(`Web-LLM Chat loaded with model: ${model_id} <br>`);
  let generating = false;
  let generationStopped = true;
  let savedTokens;

  if (startButton) {
    startButton.addEventListener("click", async () => {
      if (!generationStopped) {
        return;
      }
      log("Starting generator <br>");

      if (savedTokens !== undefined) {
        midi_loader.addEventTokens(savedTokens);
        update_midi(midi_loader.getMIDIData());
        savedTokens = undefined;
      }

      generationStopped = false;
      chat.restartGenerator();

      if (generating) {
        return;
      }
      generating = true;

      while (!generationStopped) {
        const tokens = (await chat.chunkGenerate(genConfig))
          .split(",")
          .map((str) => parseInt(str));

        console.log("UI: received generated tokens: ");
        console.log(tokens);

        log((await chat.runtimeStatsText()) + "<br>");
        if (generationStopped) {
          savedTokens = tokens;
        } else {
          midi_loader.addEventTokens(tokens);
          update_midi(midi_loader.getMIDIData());
        }
      }
      generating = false;
    });
  }

  if (pauseButton) {
    pauseButton.addEventListener("click", async () => {
      if (!generationStopped) {
        generationStopped = true;
        await chat.stopGenerator();
        log("Pausing generator <br>");
      }
    });
  }

  if (resetButton) {
    resetButton.addEventListener("click", async () => {
      log("Reset generator <br>");
      startButton.disabled = true;
      pauseButton.disabled = true;
      generationStopped = true;
      await chat.stopGenerator();
      await chat.resetChat();
      await chat.resetGenerator();
      midi_loader.reset();
      generating = false;
      savedTokens = undefined;
      startButton.disabled = false;
      pauseButton.disabled = false;
    });
  }
}

main();
