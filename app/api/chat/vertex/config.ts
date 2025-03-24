import { VertexAI } from "@google-cloud/vertexai"
import fs from "fs"

export const ENV_VARS = {
  DS_PRODUCTS: process.env.VERTEX_AI_DATASTORE_PRODUCT_DETAILS!,
  DS_PROCESS: process.env.VERTEX_AI_DATASTORE_PROCESS_AND_PROCEDURE!,
  DS_COMPARE: process.env.VERTEX_AI_DATASTORE_RECOMMENDATION_AND_COMPARISON!,
  CREDENTIALS_PATH: process.env.VERTEX_AI_CREDENTIALS_PATH!,
  PROJECT_ID: process.env.VERTEX_AI_PROJECT_ID!,
  LOCATION: process.env.VERTEX_AI_LOCATION!
}

export const REQUIRED_ENV_VARS = [
  "VERTEX_AI_DATASTORE_PRODUCT_DETAILS",
  "VERTEX_AI_DATASTORE_PROCESS_AND_PROCEDURE",
  "VERTEX_AI_DATASTORE_RECOMMENDATION_AND_COMPARISON",
  "VERTEX_AI_CREDENTIALS_PATH",
  "VERTEX_AI_PROJECT_ID",
  "VERTEX_AI_LOCATION"
]

export const validateEnv = () => {
  const missingVars = REQUIRED_ENV_VARS.filter(varName => !process.env[varName])
  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`
    )
  }
}

export const loadCredentials = (): any =>
  JSON.parse(fs.readFileSync(ENV_VARS.CREDENTIALS_PATH, "utf8"))

export const initializeVertexAI = (): VertexAI => {
  return new VertexAI({
    project: ENV_VARS.PROJECT_ID,
    location: ENV_VARS.LOCATION,
    googleAuthOptions: { credentials: loadCredentials() }
  })
}
