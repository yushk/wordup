/**
 * 词书导入：把 JSON 单词数组导入 WordBook + Word 表。
 * 幂等：同一 (wordbookId, headword) 已存在则跳过。
 *
 * 支持两种输入格式：
 * 1. 标准格式（本站定义）：
 *    [{ headword, phoneticUs?, phoneticUk?, definitions: [{pos, cn, en?}], exampleSentence?, exampleTranslation? }]
 * 2. 扇贝/kajweb dict 格式（自动转换）：
 *    [{ word: "apple", usphone, ukphone, trans: ["n. 苹果"], sentence?, sentenceTrans? }]
 */

import { prisma } from '../src/lib/db.js'

export interface StandardWord {
  headword: string
  phoneticUs?: string | null
  phoneticUk?: string | null
  definitions?: { pos: string; cn: string; en?: string }[]
  exampleSentence?: string | null
  exampleTranslation?: string | null
}

export interface WordbookMeta {
  name: string
  nameEn: string
  level: string
  sortOrder?: number
}

/** 任意输入 → 标准格式 */
export function normalizeWord(raw: Record<string, unknown>): StandardWord | null {
  // 标准格式
  if (typeof raw.headword === 'string' && raw.headword) {
    return raw as unknown as StandardWord
  }
  // kajweb/扇贝格式
  if (typeof raw.word === 'string' && raw.word) {
    const defs = Array.isArray(raw.trans)
      ? (raw.trans as string[])
          .map((t) => {
            const m = /^(.*?)\.\s*(.*)$/.exec(t.trim())
            return m ? { pos: `${m[1]}.`, cn: m[2] } : { pos: '', cn: t.trim() }
          })
          .filter((d) => d.cn)
      : []
    return {
      headword: raw.word,
      phoneticUs: (raw.usphone as string) || null,
      phoneticUk: (raw.ukphone as string) || null,
      definitions: defs,
      exampleSentence: (raw.sentence as string) || null,
      exampleTranslation: (raw.sentenceTrans as string) || null,
    }
  }
  return null
}

/** 解析「n. 苹果」混合串为 definitions（用于简单导入格式） */
export function parseTransList(trans: string[]): { pos: string; cn: string }[] {
  return trans
    .map((t) => {
      const m = /^(.*?)\.\s*(.*)$/.exec(t.trim())
      return m ? { pos: `${m[1]}.`, cn: m[2] } : { pos: '', cn: t.trim() }
    })
    .filter((d) => d.cn)
}

/** 导入一批单词到指定词书，返回统计 */
export async function importWordbookData(meta: WordbookMeta, rawWords: Record<string, unknown>[]) {
  // upsert 词书
  const wordbook = await prisma.wordBook.upsert({
    where: { level: meta.level },
    create: { name: meta.name, nameEn: meta.nameEn, level: meta.level, sortOrder: meta.sortOrder ?? 0 },
    update: { name: meta.name, nameEn: meta.nameEn },
  })

  // 过滤 + 归一化 + 按字母排序 rank
  const normalized = rawWords
    .map(normalizeWord)
    .filter((w): w is StandardWord => !!w && /^[a-zA-Z][a-zA-Z\s'-]*$/.test(w.headword))
    .sort((a, b) => a.headword.localeCompare(b.headword))

  // 去重（同词书内）
  const seen = new Set<string>()
  const unique = normalized.filter((w) => {
    const key = w.headword.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 已存在的词跳过
  const existing = await prisma.word.findMany({
    where: { wordbookId: wordbook.id },
    select: { headword: true },
  })
  const existingSet = new Set(existing.map((w) => w.headword.toLowerCase()))
  const toInsert = unique.filter((w) => !existingSet.has(w.headword.toLowerCase()))

  // 分批 createMany（SQLite/PG 单语句上限）
  const BATCH = 500
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH).map((w, idx) => ({
      wordbookId: wordbook.id,
      headword: w.headword,
      phoneticUs: w.phoneticUs ?? null,
      phoneticUk: w.phoneticUk ?? null,
      definitions: w.definitions ?? [],
      exampleSentence: w.exampleSentence ?? null,
      exampleTranslation: w.exampleTranslation ?? null,
      rank: i + idx,
    }))
    await prisma.word.createMany({ data: batch, skipDuplicates: true })
  }

  const wordCount = await prisma.word.count({ where: { wordbookId: wordbook.id } })
  await prisma.wordBook.update({ where: { id: wordbook.id }, data: { wordCount } })

  return {
    wordbookId: wordbook.id,
    total: unique.length,
    inserted: toInsert.length,
    skipped: unique.length - toInsert.length,
    wordCount,
  }
}

// ===== CLI 直跑：tsx scripts/import-wordbook.ts <file.json> <name> <nameEn> <level> =====
if (process.argv[1]?.includes('import-wordbook')) {
  const [file, name, nameEn, level] = process.argv.slice(2)
  if (!file || !name || !level) {
    console.log('用法: npm run import:wordbook -- <file.json> <中文名> <英文名> <level>')
    console.log('level: primary | junior | senior | cet4 | cet6 | kaoyan | ielts | toefl')
    process.exit(1)
  }
  const words = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(file, 'utf-8')))
  const result = await importWordbookData({ name, nameEn: nameEn ?? name, level }, words)
  console.log('导入完成:', result)
  await prisma.$disconnect()
}
