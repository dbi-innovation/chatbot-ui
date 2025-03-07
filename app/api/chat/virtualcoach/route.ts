import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import {
  HarmBlockThreshold,
  HarmCategory,
  VertexAI
} from "@google-cloud/vertexai"
import fs from "fs"

export async function POST(request: Request) {
  const json = await request.json()
  const { chatSettings, messages } = json as {
    chatSettings: ChatSettings
    messages: any[]
  }

  try {
    const profile = await getServerProfile()
    console.log("messages", messages)
    console.log("chatSettings", chatSettings)
    const credentials = JSON.parse(fs.readFileSync("./gcp.json", "utf8"))

    const vertexAI = new VertexAI({
      project: "insure-visual-agent",
      location: "us-central1",
      googleAuthOptions: { credentials }
    })

    const lastMessage = messages.pop()

    const generativeModelPreview = vertexAI.getGenerativeModel({
      model: "gemini-2.0-pro-exp-02-05",
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
        }
      ],
      generationConfig: { maxOutputTokens: 1024 }
    })

    const vertexAIRetrievalTool = {
      retrieval: {
        vertexAiSearch: {
          datastore:
            "projects/insure-visual-agent/locations/global/collections/default_collection/dataStores/products-layout-parser_1740128405991"
        },
        disableAttribution: false
      }
    }

    const result = await generativeModelPreview.generateContent({
      contents: [
        { role: "user", parts: [{ text: lastMessage.parts[0].text }] }
      ],
      tools: [vertexAIRetrievalTool]
    })
    const responsegenerateContent = result.response
    const groundingMetadata = responsegenerateContent.candidates
    console.log("Grounding metadata is: ", JSON.stringify(result))

    // Format previous messages for context
    const formattedPreviousMessages = messages.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.parts[0].text }]
    }))

    const response = await generativeModelPreview.generateContentStream({
      contents: [
        ...formattedPreviousMessages,
        { role: "user", parts: [{ text: lastMessage.parts[0].text }] }
      ],
      tools: [vertexAIRetrievalTool]
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
