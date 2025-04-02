import { Provider } from "@/types"

export const PROVIDERS: Provider[] = [
  {
    id: "digitallm",
    name: "DigitaLLM",
    applications: [
      {
        id: "virtual-coach",
        name: "Virtual Coach",
        description:
          "A personalized coaching experience that adapts to your needs."
      },
      {
        id: "sales-technique",
        name: "Sales Technique",
        description:
          "A platform designed to provide personalized coaching experiences."
      }
    ],
    description:
      "A platform designed to provide personalized coaching experiences."
  },
  {
    id: "vertex",
    name: "Vertex",
    applications: [
      {
        id: "virtual-coach",
        name: "Virtual Coach"
      }
    ],
    description:
      "A platform designed to provide personalized coaching experiences."
  }
]
