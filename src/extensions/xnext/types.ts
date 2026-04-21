export interface XNextTweet {
  id: string
  handle: string
  text: string
  url: string
  retweetedBy?: string
}

export interface XNextData {
  enabled: boolean
}
