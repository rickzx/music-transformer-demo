import * as webllm from "@mlc-ai/web-llm";
import { MusicLogitProcessor } from "./music_logit_processor";
import { CustomRequestParams, WorkerMessage } from "@mlc-ai/web-llm";

function setLabel(id: string, text: string) {
  const label = document.getElementById(id);
  if (label == null) {
    throw Error("Cannot find label " + id);
  }
  label.innerText = text;
}

class CustomChatWorkerClient extends webllm.ChatWorkerClient {
  constructor(worker: any) {
    super(worker);
    worker.onmessage = (event: any) => {
      this.onmessage(event);
    }
  }

  async chunkGenerate(genConfig?: webllm.GenerationConfig): Promise<string> {
    const msg: webllm.WorkerMessage = {
      kind: "customRequest",
      uuid: crypto.randomUUID(),
      content: {
        requestName: "chunkGenerate",
        requestMessage: JSON.stringify(genConfig)
      }
    };
    return await this.getPromise<string>(msg);
  }

  async resetGenerator(): Promise<void> {
    const msg: webllm.WorkerMessage = {
      kind: "customRequest",
      uuid: crypto.randomUUID(),
      content: {
        requestName: "resetGenerator",
        requestMessage: ""
      }
    };
    await this.getPromise<null>(msg);
  }

  onmessage(event: MessageEvent<any>): void {
    const msg = event.data as WorkerMessage;
    switch (msg.kind) {
      case "customRequest": {
        const params = msg.content as CustomRequestParams;
        if (params.requestName == 'generationRequestCallback') {
          setLabel("init-label", params.requestMessage);
        }
        return;
      }
      default:
        super.onmessage(event);
    }
  }
}

export async function initChat() {
  const musicLogitProcessor = new MusicLogitProcessor();
  const logitProcessorRegistry = new Map<string, webllm.LogitProcessor>();
  logitProcessorRegistry.set("music-medium-800k-q0f32", musicLogitProcessor);
  const chat = new CustomChatWorkerClient(new Worker(
    new URL('./worker.ts', import.meta.url),
    { type: 'module' }
  ));

  chat.setInitProgressCallback((report: webllm.InitProgressReport) => {
    setLabel("init-label", report.text);
  });

  // Define modelRecord
  const myAppConfig: webllm.AppConfig = {
    model_list: [
      {
        "model_url": "https://huggingface.co/mlc-ai/mlc-chat-stanford-crfm-music-medium-800k-q0f32-MLC/resolve/main/",
        "model_id": "music-medium-800k-q0f32",
        "model_lib_url": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/music-medium-800k/music-medium-800k-q0f32-webgpu.wasm",
      },
    ]
  }

  // Reload chat module with a logit processor
  await chat.reload("music-medium-800k-q0f32", undefined, myAppConfig);

  return chat;
}
