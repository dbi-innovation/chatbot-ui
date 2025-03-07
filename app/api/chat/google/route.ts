import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { GoogleAuth, JWT } from "google-auth-library"
import { SearchServiceClient } from "@google-cloud/discoveryengine"
import * as fs from "fs"
import * as path from "path"

export const runtime = "edge"

// Load credentials from file
const credentialsPath = path.resolve(process.cwd(), "credentials.json")
const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"))

const discoveryEngineConfig = {
  project: credentials.project_id,
  location: process.env.VERTEX_AI_LOCATION || "us-central1",
  dataStoreId: process.env.VERTEX_AI_DATA_STORE_ID // Your data store ID
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

    const genAI = new GoogleGenerativeAI(profile.google_gemini_api_key || "")
    const googleModel = genAI.getGenerativeModel({ model: chatSettings.model })

    // Initialize Google Auth with credentials
    const auth = new GoogleAuth({
      credentials: credentials,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"]
    })

    const authClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"]
    })

    // Initialize Discovery Engine Search Service Client
    const searchServiceClient = new SearchServiceClient({
      authClient: authClient
    })

    const lastMessage = messages.pop()
    const query = lastMessage.parts[0].text

    // Perform search using Discovery Engine
    const response = await searchServiceClient.search({
      servingConfig: `projects/${discoveryEngineConfig.project}/locations/${discoveryEngineConfig.location}/dataStores/${discoveryEngineConfig.dataStoreId}/servingConfigs/default_config`,
      query: query,
      pageSize: 5
    })

    // Extract results directly from response[0] if it's ISearchResult[]
    const searchResults = response[0] as any // Temporarily use 'any' to inspect

    // Check if searchResults is already the array we need
    const resultsArray = Array.isArray(searchResults)
      ? searchResults
      : searchResults.results

    // Extract content from search results
    const context =
      resultsArray
        ?.map(
          (result: {
            document: {
              derivedStructData: { snippets: { snippet: any }[] }
              structData: { content: any }
            }
          }) => {
            const content =
              result.document?.derivedStructData?.snippets?.[0]?.snippet ||
              result.document?.structData?.content ||
              JSON.stringify(result.document?.structData)
            return content || ""
          }
        )
        .filter(Boolean)
        .join("\n") || ""

    const enhancedPrompt = `Context from data store:\n${context}\n\nUser query: ${query}`

    const chat = googleModel.startChat({
      history: messages,
      generationConfig: {
        temperature: chatSettings.temperature
      }
    })

    const chatResponse = await chat.sendMessageStream(enhancedPrompt)

    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of chatResponse.stream) {
          const chunkText = chunk.text()
          controller.enqueue(encoder.encode(chunkText))
        }
        controller.close()
      }
    })

    return new Response(readableStream, {
      headers: { "Content-Type": "text/plain" }
    })
  } catch (error: any) {
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "Google Gemini API Key not found. Please set it in your profile settings."
    } else if (errorMessage.toLowerCase().includes("api key not valid")) {
      errorMessage =
        "Google Gemini API Key is incorrect. Please fix it in your profile settings."
    } else if (errorMessage.toLowerCase().includes("permission")) {
      errorMessage =
        "Authentication error. Please check your credentials.json file permissions."
    } else if (
      errorMessage.toLowerCase().includes("discovery engine") ||
      errorMessage.toLowerCase().includes("vertex ai")
    ) {
      errorMessage =
        "Vertex AI Search error. Please check your configuration and credentials."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
