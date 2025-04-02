import { FC } from "react"
import { WithTooltip } from "../ui/with-tooltip"

interface ApplicationOptionProps {
  description: string
  application: string
  onSelect: () => void
  disabled?: boolean
}

export const ApplicationOption: FC<ApplicationOptionProps> = ({
  description,
  application,
  onSelect,
  disabled = false
}) => {
  return (
    <WithTooltip
      display={
        <div>
          <div className="space-y-1 text-sm">{description}</div>
        </div>
      }
      side="bottom"
      trigger={
        <div
          className={`hover:bg-accent flex w-full cursor-pointer justify-start space-x-3 truncate rounded p-2 ${
            disabled ? "cursor-not-allowed opacity-50" : "hover:opacity-50"
          }`}
          onClick={!disabled ? onSelect : undefined}
        >
          <div className="flex items-center space-x-2">
            <div className="text-sm font-semibold">{application}</div>
          </div>
        </div>
      }
    />
  )
}
