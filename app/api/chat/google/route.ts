import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import { GoogleGenerativeAI } from "@google/generative-ai"
import path from "path"
import fs from "fs"

// Configuration for Vertex AI with Search grounding
const VERTEX_CONFIG = {
  project: process.env.VERTEX_PROJECT_ID || "insure-visual-agent",
  location: process.env.VERTEX_LOCATION || "us-central1",
  datastoreId:
    process.env.VERTEX_DATASTORE_ID ||
    "projects/insure-visual-agent/locations/global/collections/default_collection/dataStores/products-layout-parser_1740128405991"
}

// Set runtime to nodejs since VertexAI requires Node.js modules
export const runtime = "nodejs"
export const preferredRegion = ["sin1"]

// Get the absolute path to the credentials file
const getCredentialsPath = () => {
  // Use the absolute path if starting with /
  if (
    process.env.GOOGLE_APPLICATION_CREDENTIALS &&
    process.env.GOOGLE_APPLICATION_CREDENTIALS.startsWith("/")
  ) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS
  }

  // Default to the gcp.json in the root directory
  return path.join(process.cwd(), "/gcp.json")
}

export async function POST(request: Request) {
  const json = await request.json()
  const { chatSettings, messages } = json as {
    chatSettings: ChatSettings
    messages: any[]
  }

  try {
    const profile = await getServerProfile()

    checkApiKey(profile.google_gemini_api_key, "Google")

    const lastMessage = messages.pop()

    // Check if the model is a Vertex AI model with grounding support
    if (chatSettings.model === "gemini-1.5-pro-002") {
      // Dynamically import VertexAI to avoid edge runtime issues
      const { VertexAI, HarmCategory, HarmBlockThreshold } = await import(
        "@google-cloud/vertexai"
      )

      // Get credentials path
      const credentialsPath = getCredentialsPath()

      // Verify that the credentials file exists
      if (!fs.existsSync(credentialsPath)) {
        throw new Error(
          `Google Cloud credentials file not found at ${credentialsPath}`
        )
      }

      // Load service account credentials from file
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"))

      // Use Vertex AI with credentials
      const vertexAI = new VertexAI({
        project: VERTEX_CONFIG.project,
        location: VERTEX_CONFIG.location,
        googleAuthOptions: { credentials }
      })

      // Get the generative model
      const model = vertexAI.preview.getGenerativeModel({
        model: chatSettings.model,
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
          }
        ],
        generationConfig: {
          temperature: chatSettings.temperature,
          maxOutputTokens: 1024
        }
      })

      // Configure the retrieval tool for Search grounding
      const retrievalTool = {
        retrieval: {
          vertexAiSearch: {
            datastore: VERTEX_CONFIG.datastoreId
          },
          disableAttribution: false
        }
      }

      // Format previous messages for context
      const formattedPreviousMessages = messages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.parts[0].text }]
      }))

      // Create the response stream
      const response = await model.generateContentStream({
        contents: [
          ...formattedPreviousMessages,
          { role: "user", parts: [{ text: lastMessage.parts[0].text }] }
        ],
        tools: [retrievalTool]
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
    } else {
      // Use standard Google Generative AI
      const genAI = new GoogleGenerativeAI(profile.google_gemini_api_key || "")
      const googleModel = genAI.getGenerativeModel({
        model: chatSettings.model
      })

      const chat = googleModel.startChat({
        history: messages,
        generationConfig: {
          temperature: chatSettings.temperature
        }
      })

      const response = await chat.sendMessageStream(lastMessage.parts)

      const encoder = new TextEncoder()
      const readableStream = new ReadableStream({
        async start(controller) {
          for await (const chunk of response.stream) {
            const chunkText = chunk.text()
            controller.enqueue(encoder.encode(chunkText))
          }
          controller.close()
        }
      })

      return new Response(readableStream, {
        headers: { "Content-Type": "text/plain" }
      })
    }
  } catch (error: any) {
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "Google Gemini API Key not found. Please set it in your profile settings."
    } else if (errorMessage.toLowerCase().includes("api key not valid")) {
      errorMessage =
        "Google Gemini API Key is incorrect. Please fix it in your profile settings."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
