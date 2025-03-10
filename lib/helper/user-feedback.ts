export enum Action {
  SENT = "sent",
  SKIP = "skip"
}

type FeedbackStatus = {
  correctFeedbackGiven: boolean
  likeFeedbackGiven: boolean
}

const giveCorrectFeedback = (
  isContentCorrect: boolean | null,
  action: Action | null,
  status: FeedbackStatus
): FeedbackStatus => {
  if (
    isContentCorrect === true ||
    (isContentCorrect === false && action === Action.SENT)
  ) {
    return { ...status, correctFeedbackGiven: true }
  }
  return { ...status, correctFeedbackGiven: false }
}

const giveLikeFeedback = (
  isContentLiked: boolean | null,
  action: Action | null,
  status: FeedbackStatus
): FeedbackStatus => {
  if (
    (isContentLiked === true &&
      (action === Action.SKIP || action === Action.SENT)) ||
    (isContentLiked === false && action === Action.SENT)
  ) {
    return { ...status, likeFeedbackGiven: true }
  }
  return { ...status, likeFeedbackGiven: false }
}

const canInputPrompt = (status: FeedbackStatus): boolean =>
  status.correctFeedbackGiven && status.likeFeedbackGiven

export class UserFeedback {
  private status: FeedbackStatus = {
    correctFeedbackGiven: false,
    likeFeedbackGiven: false
  }

  giveCorrectFeedback(
    isContentCorrect: boolean | null,
    action: Action | null
  ): void {
    this.status = giveCorrectFeedback(isContentCorrect, action, this.status)
  }

  giveLikeFeedback(
    isContentLiked: boolean | null,
    action: Action | null
  ): void {
    this.status = giveLikeFeedback(isContentLiked, action, this.status)
  }

  canInputPrompt(): boolean {
    return canInputPrompt(this.status)
  }

  getStatus(): FeedbackStatus {
    return this.status
  }
}
