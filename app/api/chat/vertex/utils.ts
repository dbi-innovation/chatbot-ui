import { ChatSettings } from "@/types"
import {
  Content,
  GenerateContentResponse,
  GenerativeModel,
  HarmBlockThreshold,
  HarmCategory,
  RetrievalTool,
  SchemaType,
  StreamGenerateContentResult,
  VertexAI
} from "@google-cloud/vertexai"
import fs from "fs"
import { Message } from "./interface"
import { ENV_VARS } from "./config"
import pl from "nodejs-polars"
import { createResponse } from "@/lib/server/server-utils"

const CATEGORIZER_INSTRUCTION_PATH = "./instructions/classification.txt"
const QUESTION_ANALYTICS_INSTRUCTION_PATH =
  "./instructions/question-analytics.txt"
const SEPARATOR = "\n\n --- \n\n"

export const transformMessages = (messages: Message[]): Content[] =>
  messages.map(({ role, parts }) => ({
    role,
    parts: parts.map(({ text }) => ({
      text: role === "model" ? text.split(SEPARATOR)[0] : text
    }))
  }))

export const buildRagTool = (dataStoreId: string): RetrievalTool => {
  return {
    retrieval: {
      vertexAiSearch: { datastore: dataStoreId },
      disableAttribution: false
    }
  }
}

export const getTextFromGenerateContentResponse = (
  response: GenerateContentResponse
): string => response?.candidates?.[0]?.content?.parts?.[0]?.text || ""

export const buildContents = (
  history: Content[],
  message: string
): Content[] => [...history, { role: "user", parts: [{ text: message }] }]

export const extractRagUse = (responseText: string): string => {
  try {
    if (!responseText) return ENV_VARS.DS_PRODUCTS
    const { category } = JSON.parse(responseText)

    switch (category?.toUpperCase()) {
      case "PRODUCT_DETAILS":
        return ENV_VARS.DS_PRODUCTS
      case "PRODUCTS_COMPARISON":
        return ENV_VARS.DS_COMPARE
      default:
        return ENV_VARS.DS_PRODUCTS
    }
  } catch (error) {
    console.error("Failed to parse responseText:", error)
    return ENV_VARS.DS_PRODUCTS
  }
}

const readInstructionFile = (filePath: string): string => {
  try {
    return fs.readFileSync(filePath, "utf8")
  } catch (error) {
    console.error(`Failed to read instruction file (${filePath}):`, error)
    return ""
  }
}

export const getSystemInstruction = (type: string): string => {
  const instructions: Record<string, string> = {
    categorizer: CATEGORIZER_INSTRUCTION_PATH,
    questionAnalytics: QUESTION_ANALYTICS_INSTRUCTION_PATH
  }
  return readInstructionFile(instructions[type])
}

export const groundedDisplay = (ragUse: string): string => {
  const datastoreMap: Record<string, string> = {
    [ENV_VARS.DS_PRODUCTS]: "Product Details",
    [ENV_VARS.DS_COMPARE]: "Products Comparison"
  }
  return datastoreMap[ragUse] || "Unknown Category"
}

export const createGenerativeModel = (
  vertexAI: VertexAI,
  chatSettings: ChatSettings,
  config: any
): GenerativeModel => {
  return vertexAI.getGenerativeModel({
    model: chatSettings.model,
    ...config
  })
}

export function initializeModels(
  vertexAI: VertexAI,
  chatSettings: ChatSettings
) {
  return {
    classificationModel: createGenerativeModel(vertexAI, chatSettings, {
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: { category: { type: SchemaType.STRING } }
        }
      }
    }),
    generativeModel: createGenerativeModel(vertexAI, chatSettings, {
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
    }),
    analyticModel: createGenerativeModel(vertexAI, chatSettings, {
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            questions: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING }
            }
          }
        }
      }
    }),
    retrievalModel: createGenerativeModel(vertexAI, chatSettings, {
      generationConfig: {
        maxOutputTokens: chatSettings.contextLength,
        temperature: chatSettings.temperature ?? 0
      }
    })
  }
}

export async function classifyContent(
  classificationModel: GenerativeModel,
  contents: Content[]
) {
  const categorizer = await classificationModel.generateContent({
    systemInstruction: getSystemInstruction("categorizer"),
    contents
  })
  return getTextFromGenerateContentResponse(categorizer.response)
}

export async function handleRagUse(
  ragUse: string,
  lastMessage: Message,
  models: Record<string, GenerativeModel>,
  ragTool: RetrievalTool
): Promise<{ questions: string[]; retrievedContext: string[] } | undefined> {
  let questions: string[] = []
  let retrievedContext: string[] = []

  if (ragUse !== ENV_VARS.DS_COMPARE) return

  questions = await generateQuestions(
    models.analyticModel,
    lastMessage,
    ragTool
  )
  retrievedContext = await getRetrievedContext(models.retrievalModel, questions)

  return { questions, retrievedContext }
}

export async function generateQuestions(
  analyticModel: GenerativeModel,
  lastMessage: Message,
  ragTool: RetrievalTool
) {
  const analyticContents: Content[] = [
    { role: "user", parts: [{ text: lastMessage.parts[0].text }] }
  ]
  const analyticResult = await analyticModel.generateContent({
    systemInstruction: getSystemInstruction("questionAnalytics"),
    contents: analyticContents,
    tools: [ragTool]
  })
  return JSON.parse(getTextFromGenerateContentResponse(analyticResult.response))
    .questions
}

export async function getRetrievedContext(
  retrievalModel: GenerativeModel,
  questions: string[]
) {
  const retrievedContext: string[] = []
  for (const question of questions) {
    const questionResponse = await retrievalModel.generateContent({
      contents: [{ role: "user", parts: [{ text: question }] }],
      tools: [buildRagTool(ENV_VARS.DS_PRODUCTS)]
    })

    retrievedContext.push(
      (
        questionResponse?.response?.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(
          chunk => chunk?.retrievedContext?.text || ""
        ) || []
      ).join(", ")
    )
  }
  return retrievedContext
}

export async function generateResponseStream(
  generativeModel: GenerativeModel,
  chatSettings: ChatSettings,
  contents: Content[],
  ragTool: RetrievalTool,
  retrievedContext: string[],
  ragUse: string
) {
  const systemInstruction = () => {
    if (ragUse === ENV_VARS.DS_COMPARE) {
      return `${chatSettings.prompt}
        Use data from the following context to generate a response:
        <context>
        ${retrievedContext.map((ans, idx) => `${idx + 1}: ${ans}`).join("\n")}
        </context>`
    }
    return chatSettings.prompt
  }

  return generativeModel.generateContentStream({
    systemInstruction: systemInstruction(),
    contents,
    tools: [ragTool]
  })
}

function generateRankingResponse(rank?: number, point?: number): string {
  if (!rank || !point) return ""

  const messages: Record<number, string> = {
    1: `${SEPARATOR} คุณเก่งที่สุดเลยค่ะ! 🥇 ทำคะแนนได้สูงสุดแล้ว คุณอยู่ในอันดับที่ ${rank} คุณมีคะแนน ${point} เยี่ยมมากค่ะ!`,
    2: `${SEPARATOR} คุณเก่งมากเลยค่ะ! 🥈 คุณอยู่ในอันดับที่ ${rank} คุณมีคะแนน ${point} คะแนน ยินดีด้วยค่ะ! อย่างไรก็ตาม ยังมีโอกาสในการเป็นอันดับ 1 นะคะ!`,
    3: `${SEPARATOR} คุณเก่งนะคะ! 🥉 คุณอยู่ในอันดับที่ ${rank} คุณมีคะแนน ${point} คะแนน ยินดีด้วยค่ะ!`
  }

  return (
    messages[rank] ||
    `${SEPARATOR} ตอนนี้คุณอยู่ในอันดับที่ ${rank} คุณมีคะแนน ${point} คะแนน สู้ๆ นะคะ!`
  )
}

export function createReadableResponse(
  responseStream: StreamGenerateContentResult,
  ragUse: string,
  email?: string
) {
  const encoder = new TextEncoder()

  const enqueueText = (
    controller: ReadableStreamDefaultController,
    text: string
  ) => {
    if (text) controller.enqueue(encoder.encode(text))
  }

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of responseStream.stream) {
          const textChunk = getTextFromGenerateContentResponse(chunk)
          enqueueText(controller, textChunk)
        }
      } catch (error) {
        controller.error(error)
      } finally {
        await handleFinalization(controller, email, ragUse)
      }

      async function handleFinalization(
        controller: ReadableStreamDefaultController,
        email: string | undefined,
        ragUse: string
      ) {
        if (email && ragUse === ENV_VARS.DS_PRODUCTS) {
          try {
            const rank = await getUserRankingByEmail(email)
            const response = generateRankingResponse(rank?.rank, rank?.point)
            enqueueText(controller, response)
          } catch (error) {
            console.error("Error fetching user rank:", error)
          }
        }

        const groundedResponse = `${SEPARATOR} **Grounded data from :** ${groundedDisplay(ragUse)}`

        enqueueText(controller, groundedResponse)
        controller.close()
      }
    }
  })

  return new Response(readableStream, {
    headers: { "Content-Type": "text/plain" }
  })
}

export function createErrorResponse(error: any) {
  return createResponse(
    { message: error.message || "An unexpected error occurred" },
    error.status || 500
  )
}

export async function getUserRankingByEmail(email: string) {
  try {
    const df = await pl.readCSV("./ranks/dashboard.csv")
    const sortedDf = df.sort("Total Point", true)
    const rankedDf = sortedDf.withColumns(
      pl.Series(
        "rank",
        Array.from({ length: sortedDf.height }, (_, i) => i + 1)
      )
    )
    const filtered = rankedDf.filter(pl.col("userlan").eq(pl.lit(email)))

    return {
      rank: filtered.getColumn("rank").get(0),
      total: sortedDf.height,
      point: filtered.getColumn("Total Point").get(0),
      user: email
    }
  } catch (error) {
    console.error("Error reading or processing CSV file:", error)
    return
  }
}
