import { ContentType } from "@/types"
import { IconLogout, IconMessage, IconPencil } from "@tabler/icons-react"
import { FC } from "react"
import { TabsList } from "../ui/tabs"
import { WithTooltip } from "../ui/with-tooltip"
import { SidebarSwitchItem } from "./sidebar-switch-item"
import { Button } from "../ui/button"
import { supabase } from "@/lib/supabase/browser-client"
import { useRouter } from "next/navigation"

export const SIDEBAR_ICON_SIZE = 28

interface SidebarSwitcherProps {
  onContentTypeChange: (contentType: ContentType) => void
}

export const SidebarSwitcher: FC<SidebarSwitcherProps> = ({
  onContentTypeChange
}) => {
  const router = useRouter()
  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
    return
  }
  return (
    <div className="flex flex-col justify-between border-r-2 pb-5">
      <TabsList className="bg-background grid h-[440px] grid-rows-7">
        <SidebarSwitchItem
          icon={<IconMessage size={SIDEBAR_ICON_SIZE} />}
          contentType="chats"
          onContentTypeChange={onContentTypeChange}
        />
        <SidebarSwitchItem
          icon={<IconPencil size={SIDEBAR_ICON_SIZE} />}
          contentType="prompts"
          onContentTypeChange={onContentTypeChange}
        />
      </TabsList>

      <div className="flex flex-col items-center space-y-4">
        <WithTooltip
          display={<div>Sign Out</div>}
          trigger={
            <Button className="text-xs" size="sm" onClick={handleSignOut}>
              <IconLogout size={20} />
            </Button>
          }
        />
      </div>
    </div>
  )
}
