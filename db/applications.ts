import { supabase } from "@/lib/supabase/browser-client"
import { Tables } from "@/supabase/types"

export const getApplications = async (): Promise<Tables<"applications">[]> => {
  const { data: apps } = await supabase.from("applications").select("*")

  if (!apps) {
    throw new Error("No applications found")
  }

  return apps
}
