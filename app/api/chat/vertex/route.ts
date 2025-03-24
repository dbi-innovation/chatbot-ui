import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import {
  Content,
  GenerateContentResponse,
  GenerativeModel,
  HarmBlockThreshold,
  HarmCategory,
  SchemaType,
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
    "VERTEX_AI_DATASTORE_PRODUCT_DETAILS",
    "VERTEX_AI_DATASTORE_PROCESS_AND_PROCEDURE",
    "VERTEX_AI_DATASTORE_RECOMMENDATION_AND_COMPARISON",
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

const DS_PRODUCTS = process.env.VERTEX_AI_DATASTORE_PRODUCT_DETAILS!
const DS_PROCESS = process.env.VERTEX_AI_DATASTORE_PROCESS_AND_PROCEDURE!
const DS_COMPARE =
  process.env.VERTEX_AI_DATASTORE_RECOMMENDATION_AND_COMPARISON!

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

const transformMessages = (messages: Message[]): Content[] => {
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

const extractRagUse = (responseText: string): string => {
  try {
    if (!responseText) return DS_PRODUCTS
    const { category } = JSON.parse(responseText)

    switch (category?.toUpperCase()) {
      case "PRODUCT_DETAILS":
        return DS_PRODUCTS
      case "RECOMMENDATION_AND_COMPARISON":
        return DS_COMPARE
      case "PROCESS_AND_PROCEDURE":
        return DS_PROCESS
      default:
        return DS_PRODUCTS
    }
  } catch (error) {
    console.error("Failed to parse responseText:", error)
    return DS_PRODUCTS
  }
}

const categorizerSystemInstruction = () => {
  const filePath = "./instructions/classification.txt"
  try {
    return fs.readFileSync(filePath, "utf8")
  } catch (error) {
    console.error("Failed to read classification instruction file:", error)
    return ""
  }
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
    await getServerProfile()

    const vertexAI = initializeVertexAI()
    const classificationModel = vertexAI.getGenerativeModel({
      model: chatSettings.model,
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            category: {
              type: SchemaType.STRING
            }
          }
        }
      }
    })

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
    const categorizer = await classificationModel.generateContent({
      systemInstruction: categorizerSystemInstruction(),
      contents: contents
    })

    const responseText = getTextFromGenerateContentResponse(
      categorizer.response
    )

    const ragUse = extractRagUse(responseText)
    console.log("Classification: => ", ragUse)

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
          controller.enqueue(
            encoder.encode(
              `\n\n --- \n\n **Grounded data from :** ${ragUse.split("/").pop()}`
            )
          )
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
