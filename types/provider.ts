export interface Provider {
  name: string
  applications: Application[]
  description?: string
}

export interface Application {
  id: string
  name: string
  description?: string
}
