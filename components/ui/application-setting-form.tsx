"use client"

import { ChatbotUIContext } from "@/context/context"
import { FC, useContext } from "react"
import { Label } from "./label"
import { ApplicationSelect } from "../applications/app-select"

interface ApplicationSettingFormProps {}

export const ApplicationSettingForm: FC<ApplicationSettingFormProps> = ({}) => {
  const { profile } = useContext(ChatbotUIContext)

  if (!profile) return null

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Application</Label>

        <ApplicationSelect />
      </div>
    </div>
  )
}
