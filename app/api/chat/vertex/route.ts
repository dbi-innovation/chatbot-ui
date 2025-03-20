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

const transformMessages = (messages: Message[]): any[] => {
  return messages.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.parts[0].text }]
  }))
}

const buildRagTool = (rag?: string): any => {
  if (!rag) throw new Error("No RAG provided")

  const datastoresString = process.env.VERTEX_AI_DATASTORES!
  const dataStoreIds = datastoresString
    .split(",")
    .map(id => id.trim())
    .find(id => id === rag)
  if (!dataStoreIds) {
    throw new Error(
      "VERTEX_AI_DATASTORES environment variable is empty or invalid"
    )
  }

  return {
    retrieval: {
      vertexRagStore: {
        ragResources: [{ ragCorpus: dataStoreIds }],
        similarityTopK: 10,
        vectorDistanceThreshold: 0.5
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

const extractRagUse = (responseText: string) => {
  try {
    const jsonMatch = responseText.match(/{.*}/)
    if (!jsonMatch) return
    const parsed = JSON.parse(jsonMatch[0])
    return parsed?.rag
  } catch (error) {
    throw new Error(`Failed to extract RAG from response: ${error}`)
  }
}

export async function POST(request: Request) {
  try {
    validateEnv()

    const rags = process.env.VERTEX_AI_DATASTORES!.split(",")

    const CATEGORIZER_SYSTEM_INSTRUCTION = `
You are an intelligent assistant that MUST respond exclusively in valid JSON format. No additional text, spaces, or newlines outside of the JSON are permitted.

Your sole task is to categorize user queries and provide a corresponding JSON response.

For queries regarding insurance products, your response MUST be:
{"rag": "${rags[0]}"}

For queries concerning processes, procedures, or guidelines, your response MUST be:
{"rag": ${rags[1]}}

Output ONLY the JSON, ensuring it is syntactically correct and nothing else.
`

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
    const ragUse = extractRagUse(responseText) || rags[0]
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
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
