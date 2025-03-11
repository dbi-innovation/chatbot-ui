import { LLM } from "@/types"

const GOOGLE_PLATORM_LINK = "https://ai.google.dev/"

const AGENT_NAME = process.env.NEXT_PUBLIC_AGENT_NAME

// Google Models (UPDATED 12/22/23) -----------------------------

// Gemini 1.5 Flash
const GEMINI_1_5_FLASH: LLM = {
  modelId: "gemini-1.5-flash",
  modelName: AGENT_NAME ?? "Gemini 1.5 Flash",
  provider: "vertex",
  hostedId: "gemini-1.5-flash",
  platformLink: GOOGLE_PLATORM_LINK,
  imageInput: true
}

// Gemini 1.5 Pro (UPDATED 05/28/24)
const GEMINI_1_5_PRO: LLM = {
  modelId: "gemini-1.5-pro-latest",
  modelName: AGENT_NAME ?? "Gemini 1.5 Pro",
  provider: "vertex",
  hostedId: "gemini-1.5-pro-latest",
  platformLink: GOOGLE_PLATORM_LINK,
  imageInput: true
}

// Gemini Pro (UPDATED 12/22/23)
const GEMINI_PRO: LLM = {
  modelId: "gemini-pro",
  modelName: AGENT_NAME ?? "Gemini Pro",
  provider: "vertex",
  hostedId: "gemini-pro",
  platformLink: GOOGLE_PLATORM_LINK,
  imageInput: false
}

// Gemini Pro Vision (UPDATED 12/22/23)
const GEMINI_PRO_VISION: LLM = {
  modelId: "gemini-pro-vision",
  modelName: AGENT_NAME ?? "Gemini Pro Vision",
  provider: "vertex",
  hostedId: "gemini-pro-vision",
  platformLink: GOOGLE_PLATORM_LINK,
  imageInput: true
}

// Gemini 2.0 Pro Exp 02.05
const GEMINI_2_0_PRO_EXP_02_05: LLM = {
  modelId: "gemini-2.0-pro-exp-02-05",
  modelName: AGENT_NAME ?? "Gemini 2.0 Pro Exp 02.05",
  provider: "vertex",
  hostedId: "gemini-pro-vision",
  platformLink: GOOGLE_PLATORM_LINK,
  imageInput: true
}

export const VERTEX_AI_LLM_LIST: LLM[] = [
  GEMINI_PRO,
  GEMINI_PRO_VISION,
  GEMINI_1_5_PRO,
  GEMINI_1_5_FLASH,
  GEMINI_2_0_PRO_EXP_02_05
]
