import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { validateEnv, initializeVertexAI } from "./config"
import { RequestBody } from "./interface"
import {
  transformMessages,
  buildContents,
  extractRagUse,
  buildRagTool,
  classifyContent,
  createErrorResponse,
  createReadableResponse,
  generateResponseStream,
  handleRagUse,
  initializeModels
} from "./utils"

export async function POST(request: Request) {
  try {
    validateEnv()

    const { chatSettings, messages } = (await request.json()) as RequestBody
    if (!messages.length) throw new Error("No messages provided")

    await getServerProfile()

    const vertexAI = initializeVertexAI()
    const models = initializeModels(vertexAI, chatSettings)

    const lastMessage = messages.pop()
    if (!lastMessage) throw new Error("No last message found")

    const history = transformMessages(messages)
    const contents = buildContents(history, lastMessage.parts[0].text)

    const categorizerResponse = await classifyContent(
      models.classificationModel,
      contents
    )

    const ragUse = extractRagUse(categorizerResponse)
    const ragTool = buildRagTool(ragUse)
    const ragResult = await handleRagUse(ragUse, lastMessage, models, ragTool)

    const responseStream = await generateResponseStream(
      models.generativeModel,
      chatSettings,
      contents,
      ragTool,
      ragResult?.retrievedContext ?? [],
      ragUse
    )

    return createReadableResponse(responseStream, ragUse)
  } catch (error: any) {
    console.error(error)
    return createErrorResponse(error)
  }
}
