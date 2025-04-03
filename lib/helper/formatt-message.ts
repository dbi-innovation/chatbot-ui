export const formatToTitleCase = (message: string): string => {
  return message
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
