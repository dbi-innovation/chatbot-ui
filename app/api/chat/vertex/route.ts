import { ChatSettings } from "@/types"

interface Message {
  role: string
  parts: { text: string }[]
}

interface RequestBody {
  chatSettings: ChatSettings
  messages: Message[]
  chatId: string
  userId: string
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

export async function POST(request: Request) {
  try {
    validateEnv()

    const json = await request.json()
    const { messages, chatId, userId } = json as RequestBody

    if (!messages.length) {
      throw new Error("No messages provided")
    }

    const lastMessage = messages.pop()
    if (!lastMessage) {
      throw new Error(
        "Failed to retrieve the last message from the messages array"
      )
    }

    const apiUrl = `https://api.dify.ai/v1/chat-messages`
    const headers = {
      Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
      "Content-Type": "application/json"
    }
    const body = JSON.stringify({
      inputs: {},
      query: lastMessage.parts[0].text,
      response_mode: "streaming",
      conversation_id: chatId,
      user: userId,
      files: []
    })

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader()
        if (!reader) {
          controller.close()
          return
        }

        let partialChunk = ""

        const processChunk = (chunk: string) => {
          partialChunk += chunk
          const lines = partialChunk.split("\n")
          partialChunk = lines.pop() || ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue

            const jsonString = line.slice(6).trim()
            if (!jsonString) continue

            try {
              const json = JSON.parse(jsonString)
              if (json.event === "message" && json.answer) {
                controller.enqueue(encoder.encode(json.answer))
              }
            } catch (error) {
              console.error("Failed to parse JSON:", error)
            }
          }
        }

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = new TextDecoder().decode(value)
            processChunk(chunk)
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
