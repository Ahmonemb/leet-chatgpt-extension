import { ISSEChatGPTResponse } from '../../interfaces';
import { ClientError, ErrorCode } from '../../utils/errors';
import { parseSSE } from '../../utils/sse';
import { AbstractClient, IGenerateResponseParams } from '../abstract';
import ollama  from 'ollama';
import { spawn } from'child_process'

interface ConversationContext {
  conversationId: string;
  lastMessageId: string;
}

export class ChatGPTApiClient extends AbstractClient {
  private accessToken: string | undefined;

  private conversationCtx: ConversationContext | undefined;

  private modelName: string | undefined;

  async doAskAI(params: IGenerateResponseParams): Promise<void> {

    const currentModel = 'llama3.2:1b-instruct-fp16';
    spawn('ollama pull ' + currentModel, [], { shell: true, stdio: 'inherit' })

    const response = await ollama.chat({
      model: currentModel,
      messages: [
        {
          role: 'user',
          content: params.prompt,
        },
      ],
    });

    const respClone = response.message.content.clone();

    await parseSSE(respClone, (message) => {
      if (message === '[DONE]') {
        params.onEvent({ type: 'DONE' });
        return;
      }
      let data;
      try {
        data = JSON.parse(message) as ISSEChatGPTResponse;
      } catch (err) {
        console.error('parseSSE', err);
        return;
      }

      if (data.error) {
        console.error('parseSSE', data.error);
        throw new ClientError(data.error, ErrorCode.UNKOWN_ERROR);
      }
      const text = data.message?.content?.parts?.[0];
      if (text && data.message) {
        this.conversationCtx = {
          conversationId: data.conversation_id,
          lastMessageId: data.message.id,
        };
        params.onEvent({
          type: 'ANSWER',
          data: { text },
        });
      }
    });
  }

  resetConvo() {
    this.conversationCtx = undefined;
  }

  // private async getCurrentModel(): Promise<string> {
  //   if (this.modelName) return this.modelName;

  //   try {
  //     const models = await chatGPTClient.getModels(this.accessToken!);
  //     this.modelName = models[0].slug;
  //     return this.modelName;
  //   } catch (error) {
  //     console.error(error);
  //     return 'text-davinci-002-render';
  //   }
  // }
}
