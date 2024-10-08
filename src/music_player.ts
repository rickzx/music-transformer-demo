/* Doc for Music Player: https://magenta.github.io/magenta-js/music */
// import * as midis from './asset/*.mid';
import * as mm from "@magenta/music/esm/core.js";
import * as midis from "url:./assets/*.mid";
import * as mt from "./music_transformer.ts";
import { MIDILoader } from "./midi_loader.ts";
import { tensorflow } from "@magenta/music/esm/protobuf/proto";
import { GenerationConfig } from "@mlc-ai/web-llm";
import { blobToNoteSequence } from '@magenta/music';
import * as converter from './compound_converter.ts';
import { Midi } from '@tonejs/midi'

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

function selectRandomMidi() {
  const keys = Object.keys(midis);
  const index = Math.floor(Math.random() * keys.length);
  return midis[keys[index]];
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

function getModelId(model: string): string {
  if (model === "small") {
    return "music-small-800k-q0f32";
  } else if (model === "medium") {
    return "music-medium-800k-q0f32";
  }
  return "music-small-800k-q0f32";
}

function disableAllButtons() {
  const buttons = document.querySelectorAll("button");
  buttons.forEach((button) => {
    button.disabled = true;
  });
}

function enableAllButtons() {
  const buttons = document.querySelectorAll("button");
  buttons.forEach((button) => {
    button.disabled = false;
  });
}

function getSelectedInstruments(): number[] {
  const checkboxes: NodeListOf<HTMLInputElement> = document.querySelectorAll<HTMLInputElement>('#midiForm input[name="instruments"]:checked');
  const selectedInstruments: number[] = Array.from(checkboxes).map(cb => parseInt(cb.value));
  return selectedInstruments
}

async function loadMidiTokens(file: Blob) {
  if (file === null || file === undefined) {
    return [];
  }

  const fileInput = document.getElementById('midiFile');
  if (fileInput === null) {
    throw Error("Cannot find file input element");
  }

  log("Load MIDI into player. <br>");
  current_midi_url = URL.createObjectURL(file);
  blobToNoteSequence(file).then((seq) => {
    var player = document.getElementById("midi-player");
    var visualizer = document.getElementById("midi-visualizer");
    player.noteSequence = seq;
    visualizer.noteSequence = seq;
    player.playing = false;
    player.currentTime = 0;
  }).catch((reason) => {
    log('Failed to load MIDI file. <br>');
    console.log(reason);
  });

  const midi = await Midi.fromUrl(current_midi_url);
  const midiJSON = JSON.stringify(midi, undefined, 2);
  const tokens = converter.midiToEvents(midiJSON);
  return tokens;
}

async function main() {
  // Disable buttons before Web-LLM is fully loaded
  let chat: mt.CustomChatWorkerClient;

  const startButton = document.getElementById("startButton") as HTMLButtonElement;
  const pauseButton = document.getElementById("pauseButton") as HTMLButtonElement;
  const resetButton = document.getElementById("resetButton") as HTMLButtonElement;
  const downloadMidiButton = document.getElementById("downloadMidiButton") as HTMLButtonElement;
  const reloadModelButton = document.getElementById("reloadButton")! as HTMLButtonElement;
  const submitInstrumentButton = document.getElementById("submitInstrumentsButton") as HTMLButtonElement;

  disableAllButtons();

  /*************************** Managing Download ********************************/
  update_midi(selectRandomMidi());
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

  let ensemble_density = 0.0;
  const ensemble_density_slider = document.getElementById("ensembleDensity")!;
  const ensemble_density_value = document.getElementById(
    "ensembleDensity-value"
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

  ensemble_density_slider.oninput = function () {
    ensemble_density_value.innerHTML = (this as HTMLInputElement).value;
    ensemble_density = parseFloat((this as HTMLInputElement).value);
    if (chat) chat.setEnsembleDensity(ensemble_density);
  };

  submitInstrumentButton.addEventListener("click", async () => {
    log("Selected instruments: " + getSelectedInstruments().join(",") + "<br>");
    const selectedInstruments = getSelectedInstruments();
    if (chat) chat.selectInstrument(selectedInstruments.join(","));
  });

  function readConfigs() {
    genConfig = {
      temperature: parseFloat(temperature_value.innerHTML),
      top_p: parseFloat(top_p_value.innerHTML),
      frequency_penalty: parseFloat(frequency_penalty_value.innerHTML),
    };

    ensemble_density = parseFloat(ensemble_density_value.innerHTML);
    if (chat) chat.setEnsembleDensity(ensemble_density);

    const selectedInstruments = getSelectedInstruments();
    if (chat) chat.selectInstrument(selectedInstruments.join(","));
  }

  /*************************** Upload MIDI ********************************/
  let midiFilePrompt;

  window.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('midiFile');
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        disableAllButtons();
        if (e.target === null || e.target.files === null || e.target.files.length === 0) {
          enableAllButtons();
          return;
        }

        midiFilePrompt = e.target.files[0];
        log("Load MIDI into player. <br>");
        const tokens = await loadMidiTokens(midiFilePrompt);
        midi_loader.setPrompt(tokens);
        chat.resetGenerator(tokens);
        readConfigs();

        enableAllButtons();
      }); // end change listener
    }
  });

  /*************************** Model selection ********************************/
  let requestedModel = "small";
  let model_id = getModelId(requestedModel);

  if (dropdown) {
    requestedModel = dropdown.value;
    dropdown.addEventListener("change", (event) => {
      requestedModel = (event.target as HTMLSelectElement).value;
    });
  }

  reloadModelButton.addEventListener("click", async () => {
    disableAllButtons();

    generationStopped = true;
    await chat.stopGenerator();
    await chat.resetChat();
    const tokens = await loadMidiTokens(midiFilePrompt);
    midi_loader.reset();
    midi_loader.setPrompt(tokens);
    await chat.resetGenerator(tokens);
    generating = false;
    savedTokens = undefined;

    model_id = getModelId(requestedModel);
    await mt.reloadChat(chat, model_id);
    readConfigs();
    enableAllButtons();

    log(`Web-LLM Chat reloaded with model: ${model_id} <br>`)
  });

  /*************************** Init Web-LLM Chat and MIDI visualizer ********************************/
  chat = await mt.initChat(model_id);

  enableAllButtons();

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
      midi_loader.reset(true);
      const midiFileInput = document.getElementById('midiFile') as HTMLInputElement;
      if (midiFileInput) {
        midiFileInput.value = '';
        update_midi(selectRandomMidi());
      }
      generating = false;
      savedTokens = undefined;
      readConfigs();
      startButton.disabled = false;
      pauseButton.disabled = false;
    });
  }
}

main();
