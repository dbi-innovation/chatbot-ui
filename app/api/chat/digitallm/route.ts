interface Message {
  role: string
  parts: { text: string }[]
}

interface RequestBody {
  messages: Message[]
  app_name: string
  conversation_id: string
  social_id: string
  app_provider: string
  email: string
}

const getBaseUrl = (): string => {
  const baseUrl = process.env.DIGITALLM_API_URL
  if (!baseUrl) {
    throw new Error("DIGITALLM_API_URL is not defined")
  }
  return baseUrl
}

const createRequestBody = (
  lastMessage: Message,
  { app_name, conversation_id, social_id, email }: RequestBody
): string => {
  return JSON.stringify({
    inputs: { email },
    conversation_id,
    app_name,
    social_id,
    messages: [lastMessage]
  })
}

const createReadableStream = (data: string): ReadableStream => {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(data))
      } catch (error) {
        controller.error(error)
      } finally {
        controller.close()
      }
    }
  })
}

export async function POST(request: Request): Promise<Response> {
  try {
    const json = await request.json()
    const { messages, ...rest } = json as RequestBody

    if (!messages || messages.length === 0) {
      throw new Error("Messages array is empty or undefined")
    }

    const lastMessage = messages.pop()!
    const baseUrl = getBaseUrl()
    const apiUrl = `${baseUrl}/conversation`

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: createRequestBody(lastMessage, { messages, ...rest })
    })

    const responseData = await response.json()

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const readableStream = createReadableStream(responseData.answer)

    return new Response(readableStream, {
      headers: { "Content-Type": "text/plain" }
    })
  } catch (error: any) {
    console.error("Error calling DigitaLLM API:", error);

    const errorMessage = error.message || "An unexpected error occurred";
    const errorCode = error.status || 500;

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    });
  }
}
