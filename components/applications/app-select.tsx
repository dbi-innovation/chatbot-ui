import { ChatbotUIContext } from "@/context/context"
import { IconChevronDown } from "@tabler/icons-react"
import { FC, useContext, useEffect, useRef, useState } from "react"
import { Button } from "../ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "../ui/dropdown-menu"
import { Input } from "../ui/input"
import { PROVIDERS } from "./constants"
import { ApplicationOption } from "./app-option"
import { Provider } from "@/types"
import { updateWorkspace } from "@/db/workspaces"

interface ApplicationSelectProps {}

export const ApplicationSelect: FC<ApplicationSelectProps> = () => {
  const { profile, selectedProvider, setSelectedProvider, selectedWorkspace } =
    useContext(ChatbotUIContext)

  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (isOpen) {
      const focusInput = () => inputRef.current?.focus()
      setTimeout(focusInput, 100)
    }
  }, [isOpen])

  const handleSelectModel = async (provider: Provider) => {
    setSelectedProvider(provider)

    if (!selectedWorkspace?.id) return

    await updateWorkspace(selectedWorkspace.id, {
      ...selectedWorkspace,
      application_provider: provider.id,
      application: provider.applications[0].id
    })

    setIsOpen(false)
  }

  const filterProviders = () => {
    const searchLower = search.toLocaleLowerCase()
    return PROVIDERS.filter(provider =>
      provider.applications.some(application =>
        application.name.toLocaleLowerCase().includes(searchLower)
      )
    )
  }

  const renderTriggerContent = () => (
    <Button
      ref={triggerRef}
      className="flex items-center justify-between"
      variant="ghost"
    >
      <div className="flex items-center">
        {selectedProvider?.name && selectedProvider?.applications[0] ? (
          <div className="ml-2 flex items-center">
            {selectedProvider.name} : {selectedProvider.applications[0].name}
          </div>
        ) : (
          <div className="flex items-center">Select an application</div>
        )}
      </div>
      <IconChevronDown />
    </Button>
  )

  const renderApplicationOptions = () =>
    filterProviders().map((provider, index) => (
      <ProviderSection
        key={index}
        provider={provider}
        search={search}
        onSelect={handleSelectModel}
      />
    ))

  if (!profile) return null

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={isOpen => {
        setIsOpen(isOpen)
        setSearch("")
      }}
    >
      <DropdownMenuTrigger
        className="bg-background w-full justify-start border-2 px-3 py-5"
        asChild
      >
        {renderTriggerContent()}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="space-y-2 overflow-auto p-2"
        style={{ width: triggerRef.current?.offsetWidth }}
        align="start"
      >
        <Input
          ref={inputRef}
          className="w-full"
          placeholder="Search ..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="max-h-[300px] overflow-auto">
          {renderApplicationOptions()}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface ProviderSectionProps {
  provider: Provider
  search: string
  onSelect: (provider: Provider) => void
}

const ProviderSection: FC<ProviderSectionProps> = ({
  provider,
  search,
  onSelect
}) => {
  const filteredApplications = provider.applications.filter(app =>
    app.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  )

  return (
    <div>
      <div className="mb-1 ml-2 text-xs font-bold tracking-wide opacity-50">
        {provider.name.toLocaleUpperCase()}
      </div>
      <div className="mb-4">
        {filteredApplications.map(app => (
          <div key={app.id} className="flex items-center space-x-1">
            <ApplicationOption
              description={app.description || "This is an application."}
              application={app.id}
              onSelect={() =>
                onSelect({
                  ...provider,
                  applications: [app]
                })
              }
              disabled={app.id === "sales-technique"}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
