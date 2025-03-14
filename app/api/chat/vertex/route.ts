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

const CATEGORIZER_SYSTEM_INSTRUCTION = `
You are an intelligent assistant that MUST respond ONLY in valid JSON format. Do not include any markdown formatting, additional text, spaces, or newlines outside of the JSON structure itself.

Your task is to categorize user queries.

If the query is about an insurance product, respond with:
{"rag": "projects/47793440741/locations/us-central1/ragCorpora/8207810320882728960"}

If the query is about a process, procedure, or guideline, respond with:
{"rag": "projects/47793440741/locations/us-central1/ragCorpora/3019663550151917568"}

Output ONLY the JSON, strictly adhering to JSON syntax.
`

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
    console.log(responseText)

    const ragUse = JSON.parse(responseText || '{"rag":""}')?.rag
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
            console.log(textChunk)

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
    console.log("error", error)

    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
