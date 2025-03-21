import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import {
  Content,
  GenerateContentResponse,
  GenerativeModel,
  HarmBlockThreshold,
  HarmCategory,
  VertexAI
} from "@google-cloud/vertexai"
import fs from "fs"

interface Message {
  role: string
  parts: { text: string }[]
}

interface RequestBody {
  chatSettings: ChatSettings
  messages: Message[]
}

const validateEnv = () => {
  const requiredEnvVars = [
    "VERTEX_AI_DATASTORE_PRODUCTS",
    "VERTEX_AI_DATASTORE_PROCEDURE",
    "VERTEX_AI_CREDENTIALS_PATH",
    "VERTEX_AI_PROJECT_ID",
    "VERTEX_AI_LOCATION"
  ]

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])
  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`
    )
  }
}

const loadCredentials = (): any => {
  const credentialsPath = process.env.VERTEX_AI_CREDENTIALS_PATH!
  return JSON.parse(fs.readFileSync(credentialsPath, "utf8"))
}

const initializeVertexAI = (): VertexAI => {
  return new VertexAI({
    project: process.env.VERTEX_AI_PROJECT_ID!,
    location: process.env.VERTEX_AI_LOCATION!,
    googleAuthOptions: { credentials: loadCredentials() }
  })
}

const transformMessages = (messages: Message[]): any[] => {
  return messages.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.parts[0].text }]
  }))
}

const buildRagTool = (dataStoreId: string): any => {
  return {
    retrieval: {
      vertexAiSearch: {
        datastore: dataStoreId
      },
      disableAttribution: false
    }
  }
}

const getTextFromGenerateContentResponse = (
  response: GenerateContentResponse
): string => {
  return response?.candidates?.[0]?.content?.parts?.[0]?.text || ""
}

const buildContents = (history: Content[], messages: string): Content[] => {
  return [
    ...history,
    {
      role: "user",
      parts: [{ text: messages }]
    }
  ]
}

const extractRagUse = (
  responseText: string,
  dataStoreProducts: string,
  dataStoreProcedure: string
): string => {
  try {
    const jsonMatch = responseText.match(/{.*}/)
    if (!jsonMatch) return dataStoreProducts

    const { rag } = JSON.parse(jsonMatch[0])
    switch (rag?.toUpperCase()) {
      case "PRODUCTS":
        return dataStoreProducts
      case "PROCEDURE":
        return dataStoreProcedure
      default:
        return dataStoreProducts
    }
  } catch (error) {
    console.error("Failed to parse responseText:", error)
    return dataStoreProducts
  }
}

export async function POST(request: Request) {
  try {
    validateEnv()

    const dataStoreProducts = process.env.VERTEX_AI_DATASTORE_PRODUCTS!
    const dataStoreProcedure = process.env.VERTEX_AI_DATASTORE_PROCEDURE!

    const CATEGORIZER_SYSTEM_INSTRUCTION = `
### Job Description
You are a text classification engine that analyzes text data and assigns a single category based on its content.

### Task
1. Your task is to classify the input text into exactly one of the following categories:
    - **Insurance Products**
    - **Processes, Procedures, or Guidelines**
2. You must return the category in the strict JSON format:
    - **Insurance Products**  {"rag": "products"}
    - **Processes, Procedures, or Guidelines**  {"rag": "procedure"}
3. You are strictly forbidden from returning anything other than the specified JSON format.

### Format
- The response must contain only the JSON output with the rag key.
- Example valid outputs:
  - {"rag": "products"}
  - {"rag": "procedure"}

### Constraints
- Do not include any additional text, explanations, or variations.
- Ensure that exactly one category is assigned.
- Any text unrelated to the given categories must be classified as **Insurance Products** by default.
`

    const json = await request.json()
    const { chatSettings, messages } = json as RequestBody

    if (!messages.length) {
      throw new Error("No messages provided")
    }

    //@TODO use profile to personalize prompt
    await getServerProfile()

    const vertexAI = initializeVertexAI()
    const generativeModel: GenerativeModel = vertexAI.getGenerativeModel({
      model: chatSettings.model,
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
        }
      ],
      generationConfig: {
        maxOutputTokens: chatSettings.contextLength,
        temperature: chatSettings.temperature ?? 0
      }
    })

    const lastMessage = messages.pop()
    if (!lastMessage) {
      throw new Error(
        "Failed to retrieve the last message from the messages array"
      )
    }

    const history = transformMessages(messages)
    const contents = buildContents(history, lastMessage.parts[0].text)
    const categorizer = await generativeModel.generateContent({
      systemInstruction: CATEGORIZER_SYSTEM_INSTRUCTION,
      contents: contents
    })

    const responseText = getTextFromGenerateContentResponse(
      categorizer.response
    )

    const ragUse = extractRagUse(
      responseText,
      dataStoreProducts,
      dataStoreProcedure
    )

    const ragTool = buildRagTool(ragUse)

    const responseStream = await generativeModel.generateContentStream({
      systemInstruction: chatSettings.prompt,
      contents: contents,
      tools: [ragTool]
    })

    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream.stream) {
            const textChunk = getTextFromGenerateContentResponse(chunk)
            if (!textChunk) continue
            controller.enqueue(encoder.encode(textChunk))
          }
        } catch (error) {
          controller.error(error)
        } finally {
          controller.close()
        }
      }
    })

    return new Response(readableStream, {
      headers: { "Content-Type": "text/plain" }
    })
  } catch (error: any) {
    console.log(error)

    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
