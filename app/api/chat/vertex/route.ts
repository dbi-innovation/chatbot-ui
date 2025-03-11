import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import {
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
    "VERTEX_AI_DATASTORES",
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

const buildRetrievalTools = (): any[] => {
  const datastoresString = process.env.VERTEX_AI_DATASTORES!
  const dataStoreIds = datastoresString.split(",").map(id => id.trim())
  if (dataStoreIds.length === 0) {
    throw new Error(
      "VERTEX_AI_DATASTORES environment variable is empty or invalid"
    )
  }
  return dataStoreIds.map(datastore => ({
    retrieval: {
      vertexAiSearch: { datastore },
      disableAttribution: false
    }
  }))
}

const transformMessages = (messages: Message[]): any[] => {
  return messages.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.parts[0].text }]
  }))
}

export async function POST(request: Request) {
  try {
    validateEnv()

    const json = await request.json()
    const { chatSettings, messages } = json as RequestBody

    if (!messages.length) {
      throw new Error("No messages provided")
    }

    //@TODO use profile to personalize prompt
    const profile = await getServerProfile()

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
      },
      systemInstruction: chatSettings.prompt
    })

    const lastMessage = messages.pop()
    if (!lastMessage) {
      throw new Error(
        "Failed to retrieve the last message from the messages array"
      )
    }
    const formattedPreviousMessages = transformMessages(messages)

    const tools = buildRetrievalTools()

    const response = await generativeModel.generateContentStream({
      contents: [
        ...formattedPreviousMessages,
        { role: "user", parts: [{ text: lastMessage.parts[0].text }] }
      ],
      tools: tools
    })

    // Stream the response back to the client
    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response.stream) {
            const textChunk =
              chunk.candidates?.[0]?.content?.parts[0]?.text || ""
            if (textChunk) {
              controller.enqueue(encoder.encode(textChunk))
            }
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      }
    })

    return new Response(readableStream, {
      headers: { "Content-Type": "text/plain" }
    })
  } catch (error: any) {
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
