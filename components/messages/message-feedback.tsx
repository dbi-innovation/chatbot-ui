import { FC, useContext, useEffect, useRef, useState } from "react"
import { WithTooltip } from "../ui/with-tooltip"
import {
  IconCheck,
  IconHeart,
  IconHeartBroken,
  IconSend,
  IconX
} from "@tabler/icons-react"
import { TextareaAutosize } from "../ui/textarea-autosize"
import { cn } from "@/lib/utils"
import { updateMessage } from "@/db/messages"
import { Tables } from "@/supabase/types"
import { ChatbotUIContext } from "@/context/context"
import { Action, UserFeedback } from "@/lib/helper/user-feedback"

export const MESSAGE_ICON_SIZE = 24

interface MessageFeedbackActionsProps {
  isHovering: boolean
  isLast: boolean
  message: Tables<"messages">
}

interface FeedbackButtonProps {
  isActive: boolean | null
  onClick: () => void
  activeClass: string
  inactiveClass: string
  IconComponent: FC<{ size: number; className: string; onClick: () => void }>
  display?: string
  disabled?: boolean
}

const FeedbackButton: FC<FeedbackButtonProps> = ({
  isActive,
  onClick,
  activeClass,
  inactiveClass,
  IconComponent,
  display,
  disabled
}) => (
  <WithTooltip
    delayDuration={1000}
    side="bottom"
    display={<div>{display}</div>}
    trigger={
      <IconComponent
        size={MESSAGE_ICON_SIZE}
        onClick={!disabled ? onClick : () => {}}
        className={`${isActive ? activeClass : inactiveClass} rounded p-1 ${
          disabled ? "cursor-not-allowed" : ""
        }`}
      />
    }
  />
)

interface FeedbackTextareaProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  visible: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement>
  enableSkip?: boolean
  onSkip?: () => void
  placeholder?: string
}

const FeedbackTextarea: FC<FeedbackTextareaProps> = ({
  value,
  onChange,
  onSubmit,
  visible,
  textareaRef,
  enableSkip,
  onSkip,
  placeholder
}) => {
  if (!visible) return null

  return (
    <div className="border-input relative mt-3 flex min-h-[60px] w-full items-center justify-center rounded-xl border-2">
      <TextareaAutosize
        textareaRef={textareaRef}
        className="text-md flex w-full resize-none rounded-md py-4 text-white focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        onValueChange={onChange}
        value={value}
        minRows={1}
        placeholder={placeholder}
      />
      <div className="absolute bottom-[14px] right-16 cursor-pointer hover:opacity-50">
        {enableSkip && (
          <div
            className={cn("bg-primary text-secondary rounded p-1 text-sm")}
            onClick={onSkip}
          >
            Skip
          </div>
        )}
      </div>
      <div className="absolute bottom-[14px] right-3 cursor-pointer hover:opacity-50">
        <div
          className={cn(
            "bg-primary text-secondary rounded p-1 text-sm",
            !value && "cursor-not-allowed opacity-50"
          )}
          onClick={() => {
            if (!value) return
            onSubmit()
          }}
        >
          Send
        </div>
      </div>
    </div>
  )
}

export const MessageFeedbackActions: FC<MessageFeedbackActionsProps> = ({
  isHovering,
  message,
  isLast
}) => {
  const { setDisableChatInput } = useContext(ChatbotUIContext)

  const {
    id,
    is_content_correct,
    incorrect_reason,
    is_content_liked,
    feedback
  } = message

  const [isCorrect, setIsCorrect] = useState<boolean | null>(is_content_correct)
  const [inCorrectReasonContent, setInCorrectReasonContent] = useState<
    string | null
  >(incorrect_reason)
  const [inCorrectReasonVisible, setInCorrectReasonVisible] = useState<boolean>(
    is_content_correct === false && inCorrectReasonContent === null
  )
  const [correctAction, setCorrectAction] = useState<Action | null>(null)

  const [isLiked, setIsLiked] = useState<boolean | null>(is_content_liked)
  const [feedbackContent, setFeedbackContent] = useState<string | null>(
    feedback
  )
  const [feedbackVisible, setFeedbackVisible] = useState<boolean>(
    is_content_liked === false && feedback === null
  )
  const [likeAction, setLikeAction] = useState<Action | null>(null)

  const inCorrectReasonRef = useRef<HTMLTextAreaElement>(null)
  const feedbackRef = useRef<HTMLTextAreaElement>(null)

  const onSubmitInCorrectReason = () => {
    setInCorrectReasonVisible(false)
    setCorrectAction(Action.SENT)
    updateMessage(id, {
      is_content_correct: isCorrect,
      incorrect_reason: inCorrectReasonContent
    })
  }

  const onSubmitFeedback = () => {
    setFeedbackVisible(false)
    setLikeAction(Action.SENT)
    updateMessage(id, {
      is_content_liked: isLiked,
      feedback: feedbackContent
    })
  }

  const onCorrectClick = () => {
    setIsCorrect(true)
    updateMessage(id, {
      is_content_correct: true
    })
  }

  const onIncorrectClick = () => {
    setIsCorrect(false)
    setInCorrectReasonVisible(true)
    updateMessage(id, {
      is_content_correct: false
    })
  }

  const onLikedClick = () => {
    setIsLiked(true)
    setLikeAction(Action.SKIP)
    updateMessage(id, {
      is_content_liked: true
    })
  }

  const onDislikedClick = () => {
    setIsLiked(false)
    setFeedbackVisible(true)
    updateMessage(id, {
      is_content_liked: false
    })
  }

  useEffect(() => {
    const userFeedback = new UserFeedback()
    userFeedback.giveCorrectFeedback(isCorrect, correctAction)
    userFeedback.giveLikeFeedback(isLiked, likeAction)

    setDisableChatInput(!userFeedback.canInputPrompt())
  }, [
    feedbackContent,
    inCorrectReasonContent,
    isCorrect,
    isLiked,
    feedbackVisible,
    inCorrectReasonVisible,
    setDisableChatInput,
    correctAction,
    likeAction
  ])

  const renderFeedbackButtons = () => (
    <>
      <div className="mx-[2px] flex justify-end space-x-2">
        <p>ถูกต้องหรือไม่?</p>
        <FeedbackButton
          isActive={isCorrect === true}
          onClick={onCorrectClick}
          activeClass="border border-white text-white"
          inactiveClass="border border-gray-500"
          IconComponent={IconCheck}
          display="ถูกต้อง"
          disabled={isCorrect !== null}
        />
        <FeedbackButton
          isActive={isCorrect === false}
          onClick={onIncorrectClick}
          activeClass="border border-red-500 text-red-500"
          inactiveClass="border border-gray-500"
          IconComponent={IconX}
          display="ไม่ถูกต้อง"
          disabled={isCorrect !== null}
        />
      </div>
      <FeedbackTextarea
        value={inCorrectReasonContent || ""}
        onChange={setInCorrectReasonContent}
        onSubmit={onSubmitInCorrectReason}
        visible={inCorrectReasonVisible}
        textareaRef={inCorrectReasonRef}
        placeholder="ขอรายละเอียดเพิ่มเติมหน่อยค่ะ"
      />
    </>
  )

  const renderLikeButtons = () => (
    <>
      <div className="mx-[2px] flex justify-end space-x-2">
        <p>ถูกใจหรือเปล่า?</p>
        <FeedbackButton
          isActive={isLiked === true}
          onClick={onLikedClick}
          activeClass="border border-white text-white"
          inactiveClass="border border-gray-500"
          IconComponent={IconHeart}
          display="ถูกใจ"
          disabled={isLiked !== null}
        />
        <FeedbackButton
          isActive={isLiked === false}
          onClick={onDislikedClick}
          activeClass="border border-red-500 text-red-500"
          inactiveClass="border border-gray-500"
          IconComponent={IconHeartBroken}
          display="ไม่ถูกใจ"
          disabled={isLiked !== null}
        />
      </div>
      <FeedbackTextarea
        value={feedbackContent || ""}
        onChange={setFeedbackContent}
        onSubmit={onSubmitFeedback}
        visible={feedbackVisible}
        textareaRef={feedbackRef}
        placeholder="ขอรายละเอียดเพิ่มเติมหน่อยค่ะ"
      />
    </>
  )

  return (
    isLast && (
      <div className="text-muted-foreground flex-col space-y-2">
        {renderFeedbackButtons()}
        {renderLikeButtons()}
      </div>
    )
  )
}
