/**
 * 出题服务：根据目标词 + 同词书干扰项生成四种题型
 */

export type QuizType = 'en2cn' | 'cn2en' | 'listening' | 'cloze'

export interface QuizWord {
  id: number
  headword: string
  definitions: { pos: string; cn: string; en?: string }[]
  exampleSentence?: string | null
}

export interface QuizQuestion {
  type: QuizType
  wordId: number
  headword: string
  /** 题干文字（listening 时为空，用 audioText 播放） */
  prompt: string
  /** listening 题型：TTS 要播放的文本 */
  audioText?: string
  /** cloze 题型：完整例句（前端展示译文用） */
  fullSentence?: string
  options: string[]
  answer: string
}

/** 取词的第一条中文释义（合并多条，不带词性前缀，作为选项展示更简洁） */
function primaryCn(word: QuizWord): string {
  const defs = word.definitions ?? []
  if (defs.length === 0) return word.headword
  return defs
    .slice(0, 2)
    .map((d) => d.cn)
    .join('；')
}

/** 从数组随机取 n 个（洗牌） */
export function sampleN<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

/** 挖空例句中的目标词（大小写不敏感，保留标点） */
function clozeSentence(sentence: string, headword: string): string {
  const re = new RegExp(`\\b${escapeRegExp(headword)}\\b`, 'gi')
  const replaced = sentence.replace(re, '____')
  return replaced.includes('____') ? replaced : `____ ${sentence}`
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 打乱选项顺序 */
function shuffleOptions(opts: string[]): string[] {
  return sampleN(opts, opts.length)
}

/**
 * 生成一道题。distractors 为同词书随机词（数量 ≥ 3 时出 4 选项题）。
 */
export function buildQuizQuestion(
  word: QuizWord,
  distractors: QuizWord[],
  type: QuizType,
): QuizQuestion {
  const cn = primaryCn(word)
  let options: string[]
  let answer: string

  switch (type) {
    case 'en2cn':
    case 'listening': {
      answer = cn
      options = buildUniqueOptions(cn, distractors.map(primaryCn), 4)
      break
    }
    case 'cn2en':
    case 'cloze': {
      answer = word.headword
      options = buildUniqueOptions(word.headword, distractors.map((d) => d.headword), 4)
      break
    }
  }

  const question: QuizQuestion = {
    type,
    wordId: word.id,
    headword: word.headword,
    prompt: '',
    options: shuffleOptions(options),
    answer,
  }

  if (type === 'en2cn') {
    question.prompt = word.headword
  } else if (type === 'cn2en') {
    question.prompt = cn
  } else if (type === 'listening') {
    question.prompt = ''
    question.audioText = word.headword
  } else {
    const sentence = word.exampleSentence ?? `____ (${word.headword})`
    question.fullSentence = sentence
    question.prompt = clozeSentence(sentence, word.headword)
  }

  return question
}

/** 答案 + 干扰项 → 去重后恰好 n 个选项（干扰项不足时用占位） */
function buildUniqueOptions(answer: string, candidates: string[], n: number): string[] {
  const seen = new Set([answer.toLowerCase()])
  const opts: string[] = [answer]
  for (const c of candidates) {
    if (opts.length >= n) break
    const key = c.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      opts.push(c)
    }
  }
  return opts
}
