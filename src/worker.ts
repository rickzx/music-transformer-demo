// Serve the chat workload through web worker
import { ChatWorkerHandler, ChatModule, LogitProcessor, WorkerMessage, CustomRequestParams, ChatInterface, GenerationConfig } from "@mlc-ai/web-llm";
import { MusicLogitProcessor } from "./music_logit_processor";
import { ChunkGenerator, GenerationProgressCallback } from "./music_transformer_generate";


const musicLogitProcessor = new MusicLogitProcessor();
const logitProcessorRegistry = new Map<string, LogitProcessor>();

logitProcessorRegistry.set("music-small-800k-q0f32", musicLogitProcessor);
logitProcessorRegistry.set("music-medium-800k-q0f32", musicLogitProcessor);

class CustomChatWorkerHandler extends ChatWorkerHandler {
  private chunkGenerator: ChunkGenerator;
  private chunkIterator: AsyncGenerator<Array<number>, void, void>;
  private callback: GenerationProgressCallback;

  constructor(chat: ChatInterface) {
    super(chat);
    this.callback = (generated, total) => {
      const msg: WorkerMessage = {
        kind: "customRequest",
        uuid: "",
        content: {
          requestName: "generationRequestCallback",
          requestMessage: `Generated ${generated}/${total} tokens`
        }
      };
      postMessage(msg);
    }
    this.chunkGenerator = new ChunkGenerator();
    this.chunkIterator = this.chunkGenerator.chunkGenerate(chat, musicLogitProcessor, this.callback);
  }

  onmessage(event: MessageEvent<any>): void {
    const msg = event.data as WorkerMessage;
    switch (msg.kind) {
      case "customRequest": {
        const params = msg.content as CustomRequestParams;
        if (params.requestName == 'chunkGenerate') {
          const genConfig = JSON.parse(params.requestMessage) as GenerationConfig;
          this.chunkGenerator.setGenConfig(genConfig);
          console.log("Worker: generating music-transformer tokens with config", genConfig);
          this.handleTask(msg.uuid, async () => {
            const { value } = await this.chunkIterator.next();
            console.log("Worker: done generating");
            return value!.join();
          });
        } else if (params.requestName == "resetGenerator") {
          console.log("Worker: reset music-transformer generator");
          this.handleTask(msg.uuid, async () => {
            this.chunkGenerator.interrupt();
            
            this.chunkGenerator = new ChunkGenerator();
            this.chunkIterator = this.chunkGenerator.chunkGenerate(chat, musicLogitProcessor, this.callback);
            musicLogitProcessor.resetState();
            chat.resetChat();
            return null;
          })
        } else if (params.requestName == 'interrupt') {
          console.log("Worker: pausing music-transformer generator");
          this.handleTask(msg.uuid, async () => {
            this.chunkGenerator.setPause();
            return null;
          });
        } else if (params.requestName == 'restart') {
          console.log("Worker: restarting music-transformer generator");
          this.handleTask(msg.uuid, async () => {
            this.chunkGenerator.setPause(false);
            return null;
          });
        }
        return;
      }
      default:
        super.onmessage(event);
    }
  }
}

const chat = new ChatModule(logitProcessorRegistry);
const handler = new CustomChatWorkerHandler(chat);
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
