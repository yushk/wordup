import { describe, it, expect } from 'vitest'
import { buildQuizQuestion } from '../src/services/quiz.js'

const baseWord = {
  id: 1,
  headword: 'apple',
  phoneticUs: 'ˈæpl',
  phoneticUk: 'ˈæpl',
  definitions: [
    { pos: 'n.', cn: '苹果', en: 'a round red fruit' },
  ],
  exampleSentence: 'An apple a day keeps the doctor away.',
  exampleTranslation: '一天一苹果，医生远离我。',
}

const distractors = [
  { ...baseWord, id: 2, headword: 'banana', definitions: [{ pos: 'n.', cn: '香蕉', en: 'a yellow fruit' }] },
  { ...baseWord, id: 3, headword: 'cherry', definitions: [{ pos: 'n.', cn: '樱桃', en: 'a small red fruit' }] },
  { ...baseWord, id: 4, headword: 'grape', definitions: [{ pos: 'n.', cn: '葡萄', en: 'a small purple fruit' }] },
]

describe('出题服务 buildQuizQuestion', () => {
  it('en2cn：题干为单词，选项为中文释义，含 1 正确 + 3 干扰', () => {
    const q = buildQuizQuestion(baseWord as never, distractors as never, 'en2cn')
    expect(q.type).toBe('en2cn')
    expect(q.prompt).toBe('apple')
    expect(q.options).toHaveLength(4)
    expect(q.options).toContain('苹果')
    expect(q.answer).toBe('苹果')
  })

  it('cn2en：题干为中文，选项为英文单词', () => {
    const q = buildQuizQuestion(baseWord as never, distractors as never, 'cn2en')
    expect(q.type).toBe('cn2en')
    expect(q.prompt).toBe('苹果')
    expect(q.options).toContain('apple')
    expect(q.answer).toBe('apple')
  })

  it('listening：题干为 TTS 播放的词（headword），选项为中文释义', () => {
    const q = buildQuizQuestion(baseWord as never, distractors as never, 'listening')
    expect(q.type).toBe('listening')
    expect(q.audioText).toBe('apple')
    expect(q.options).toContain('苹果')
    expect(q.answer).toBe('苹果')
  })

  it('cloze：例句中目标词被挖空，选项为英文近形词', () => {
    const q = buildQuizQuestion(baseWord as never, distractors as never, 'cloze')
    expect(q.type).toBe('cloze')
    expect(q.prompt).not.toContain('apple')
    expect(q.prompt).toContain('____')
    expect(q.options).toContain('apple')
    expect(q.answer).toBe('apple')
  })

  it('干扰项去重且不与答案重复，恒 4 个选项', () => {
    // 干扰项里塞一个重复词和一个同答案词
    const dupDistractors = [...distractors, distractors[0], { ...baseWord, id: 9 }]
    const q = buildQuizQuestion(baseWord as never, dupDistractors as never, 'en2cn')
    expect(new Set(q.options).size).toBe(4)
    expect(q.options.filter((o: string) => o === '苹果').length).toBe(1)
  })

  it('cloze：目标词大小写不同形式也要挖空（句首 Apple）', () => {
    const w = { ...baseWord, exampleSentence: 'Apple trees bloom in spring.' }
    const q = buildQuizQuestion(w as never, distractors as never, 'cloze')
    expect(q.prompt.startsWith('____')).toBe(true)
  })
})
