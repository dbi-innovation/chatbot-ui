import { ChatSettings } from "@/types"

export interface Message {
  role: string
  parts: { text: string }[]
}

export interface RequestBody {
  chatSettings: ChatSettings
  messages: Message[]
}