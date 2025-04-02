import { ChatbotUIContext } from "@/context/context"
import useHotkey from "@/lib/hooks/use-hotkey"
import { IconAdjustmentsHorizontal } from "@tabler/icons-react"
import { FC, useContext, useRef, useCallback } from "react"
import { Button } from "../ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { ApplicationSettingForm } from "../ui/application-setting-form"
import { formatToTitleCase } from "@/lib/helper/formatt-message"

interface ApplicationSettingsProps {}

export const ApplicationSettings: FC<ApplicationSettingsProps> = () => {
  const { selectedProvider } = useContext(ChatbotUIContext)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const handleClick = useCallback(() => {
    buttonRef.current?.click()
  }, [])

  useHotkey("i", handleClick)

  if (!selectedProvider) return null

  const applicationName =
    formatToTitleCase(selectedProvider?.name) || "Select Application"
  const firstApplicationName = formatToTitleCase(
    selectedProvider?.applications[0]?.name
  )
  const displayName = `${applicationName}${selectedProvider?.name ? " : " : ""}${firstApplicationName}`

  return (
    <Popover>
      <PopoverTrigger>
        <Button
          ref={buttonRef}
          className="flex items-center space-x-2"
          variant="ghost"
        >
          <div className="max-w-[120px] truncate text-lg sm:max-w-[300px] lg:max-w-[500px]">
            {displayName}
          </div>
          <IconAdjustmentsHorizontal size={28} />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="bg-background border-input relative flex max-h-[calc(100vh-60px)] w-[300px] flex-col space-y-4 overflow-auto rounded-lg border-2 p-6 sm:w-[350px] md:w-[400px] lg:w-[500px] dark:border-none"
        align="end"
      >
        <ApplicationSettingForm />
      </PopoverContent>
    </Popover>
  )
}
