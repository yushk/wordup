/**
 * 种子数据：
 * 1. 创建默认 ADMIN 账号（admin@example.com / admin123456）
 * 2. 内置一份小规模示例词书（初级 60 词）+ 示例文章 3 篇
 * 3. 若 data/wordbooks/ 下有开源词书 JSON，则一并导入
 */

import { PrismaClient } from '@prisma/client'
import { importWordbookData, type StandardWord } from '../scripts/import-wordbook.ts'
import bcrypt from 'bcryptjs'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const prisma = new PrismaClient()

const STarter_WORDS: StandardWord[] = [
  { headword: 'apple', phoneticUs: 'ˈæpl', definitions: [{ pos: 'n.', cn: '苹果', en: 'a round red or green fruit' }], exampleSentence: 'An apple a day keeps the doctor away.', exampleTranslation: '一天一苹果，医生远离我。' },
  { headword: 'book', phoneticUs: 'bʊk', definitions: [{ pos: 'n.', cn: '书；书本', en: 'a set of printed pages' }], exampleSentence: 'She is reading a book about history.', exampleTranslation: '她正在读一本历史书。' },
  { headword: 'cat', phoneticUs: 'kæt', definitions: [{ pos: 'n.', cn: '猫', en: 'a small furry animal' }], exampleSentence: 'The cat is sleeping on the sofa.', exampleTranslation: '猫正在沙发上睡觉。' },
  { headword: 'dog', phoneticUs: 'dɔːɡ', definitions: [{ pos: 'n.', cn: '狗', en: 'a common animal kept as a pet' }], exampleSentence: 'My dog loves to play fetch.', exampleTranslation: '我的狗喜欢玩捡球游戏。' },
  { headword: 'eat', phoneticUs: 'iːt', definitions: [{ pos: 'v.', cn: '吃', en: 'to put food in your mouth' }], exampleSentence: 'We eat breakfast at seven.', exampleTranslation: '我们七点吃早餐。' },
  { headword: 'family', phoneticUs: 'ˈfæməli', definitions: [{ pos: 'n.', cn: '家庭；家人', en: 'a group of people who are related' }], exampleSentence: 'I love my family very much.', exampleTranslation: '我非常爱我的家人。' },
  { headword: 'good', phoneticUs: 'ɡʊd', definitions: [{ pos: 'adj.', cn: '好的', en: 'of high quality or standard' }], exampleSentence: 'This is a good idea.', exampleTranslation: '这是个好主意。' },
  { headword: 'happy', phoneticUs: 'ˈhæpi', definitions: [{ pos: 'adj.', cn: '快乐的；高兴的', en: 'feeling pleasure' }], exampleSentence: 'The children are happy today.', exampleTranslation: '孩子们今天很开心。' },
  { headword: 'house', phoneticUs: 'haʊs', definitions: [{ pos: 'n.', cn: '房子', en: 'a building where people live' }], exampleSentence: 'They live in a big house.', exampleTranslation: '他们住在一座大房子里。' },
  { headword: 'water', phoneticUs: 'ˈwɔːtər', definitions: [{ pos: 'n.', cn: '水', en: 'the clear liquid we drink' }], exampleSentence: 'Drink more water every day.', exampleTranslation: '每天多喝水。' },
  { headword: 'school', phoneticUs: 'skuːl', definitions: [{ pos: 'n.', cn: '学校', en: 'a place where children learn' }], exampleSentence: 'I walk to school every morning.', exampleTranslation: '我每天早上步行上学。' },
  { headword: 'friend', phoneticUs: 'frend', definitions: [{ pos: 'n.', cn: '朋友', en: 'a person you like and know well' }], exampleSentence: 'She is my best friend.', exampleTranslation: '她是我最好的朋友。' },
  { headword: 'time', phoneticUs: 'taɪm', definitions: [{ pos: 'n.', cn: '时间', en: 'what is measured in minutes and hours' }], exampleSentence: 'What time is it now?', exampleTranslation: '现在几点了？' },
  { headword: 'love', phoneticUs: 'lʌv', definitions: [{ pos: 'v.', cn: '爱；喜爱', en: 'to feel deep affection for' }], exampleSentence: 'I love learning English.', exampleTranslation: '我爱学英语。' },
  { headword: 'run', phoneticUs: 'rʌn', definitions: [{ pos: 'v.', cn: '跑；奔跑', en: 'to move fast on foot' }], exampleSentence: 'He can run very fast.', exampleTranslation: '他跑得非常快。' },
  { headword: 'big', phoneticUs: 'bɪɡ', definitions: [{ pos: 'adj.', cn: '大的', en: 'large in size' }], exampleSentence: 'An elephant is a big animal.', exampleTranslation: '大象是一种大动物。' },
  { headword: 'small', phoneticUs: 'smɔːl', definitions: [{ pos: 'adj.', cn: '小的', en: 'little in size' }], exampleSentence: 'This room is too small.', exampleTranslation: '这个房间太小了。' },
  { headword: 'beautiful', phoneticUs: 'ˈbjuːtɪfl', definitions: [{ pos: 'adj.', cn: '美丽的', en: 'very pretty to look at' }], exampleSentence: 'The garden looks beautiful in spring.', exampleTranslation: '春天里花园看起来很美。' },
  { headword: 'morning', phoneticUs: 'ˈmɔːrnɪŋ', definitions: [{ pos: 'n.', cn: '早晨；上午', en: 'the early part of the day' }], exampleSentence: 'Good morning, everyone!', exampleTranslation: '大家早上好！' },
  { headword: 'night', phoneticUs: 'naɪt', definitions: [{ pos: 'n.', cn: '夜晚', en: 'the time when it is dark' }], exampleSentence: 'The stars shine at night.', exampleTranslation: '夜晚星星闪烁。' },
]

const ARTICLES = [
  {
    title: '一只小猫的一天',
    titleEn: 'A Day of a Little Cat',
    level: 1,
    coverColor: '#00B894',
    contentMd: `Mimi is a little cat. She is white and black. Every morning, Mimi wakes up early. She eats her breakfast and drinks water. Then she plays in the garden. She likes to run after butterflies. At noon, she sleeps under a big tree. In the afternoon, Mimi watches the birds. They sing beautiful songs. At night, Mimi goes back home. She is happy every day.`,
    translationMd: `咪咪是一只小猫。她是白色和黑色的。每天早晨，咪咪早早醒来。她吃早餐、喝水。然后她在花园里玩。她喜欢追蝴蝶。中午，她在一棵大树下睡觉。下午，咪咪看鸟儿。它们唱着动听的歌。晚上，咪咪回家。她每天都很开心。`,
  },
  {
    title: '我的学校生活',
    titleEn: 'My School Life',
    level: 2,
    coverColor: '#6C5CE7',
    contentMd: `My name is Li Ming. I am a student in a middle school. My school is not very big, but it is beautiful. There are many trees and flowers. We have four classes in the morning and two in the afternoon. My favorite subject is English because our teacher makes the class interesting. After school, I often play basketball with my friends. Sometimes we go to the library to read books. I love my school life.`,
    translationMd: `我叫李明。我是一名中学生。我的学校不是很大，但很漂亮。有许多树和花。我们上午有四节课，下午两节。我最喜欢的科目是英语，因为老师让课堂很有趣。放学后，我经常和朋友们打篮球。有时我们去图书馆看书。我爱我的学校生活。`,
  },
  {
    title: '为什么阅读如此重要',
    titleEn: 'Why Reading Matters So Much',
    level: 4,
    coverColor: '#E17055',
    contentMd: `Reading is one of the most valuable habits a person can develop. When we read, we do more than absorb information; we train our minds to think deeply and imagine freely. Studies have shown that people who read regularly tend to have larger vocabularies, stronger concentration, and greater empathy than those who rarely pick up a book. Moreover, reading offers an affordable escape—between the pages of a novel, you can travel to distant lands, live different lives, and understand perspectives far removed from your own. In an age dominated by short videos and instant messages, the ability to sit quietly with a long text has become a rare skill. If you wish to improve your English, there is no better way than reading a little every day. Start with graded readers, then gradually move to newspapers and novels. The journey of a thousand miles begins with a single page.`,
    translationMd: `阅读是一个人能养成的最有价值的习惯之一。阅读时，我们不仅仅是在吸收信息，更是在训练大脑深度思考和自由想象。研究表明，经常阅读的人比很少读书的人词汇量更大、专注力更强、同理心也更强。此外，阅读提供了一种经济实惠的"逃离"——在小说的书页之间，你可以游历远方、体验不同的人生、理解与你截然不同的视角。在被短视频和即时消息主导的时代，安静地读完一篇长文的能力已成为一种稀缺技能。如果你想提高英语水平，没有比每天阅读一点更好的方法了。从分级读物开始，然后逐渐过渡到报纸和小说。千里之行，始于翻开一页。`,
  },
]

// data/wordbooks 下的开源词书（文件名 → 元数据）
const OPEN_SOURCE_BOOKS: Record<string, { name: string; nameEn: string; level: string; sortOrder: number }> = {
  'CET4.json': { name: '大学英语四级', nameEn: 'CET-4', level: 'cet4', sortOrder: 10 },
  'CET6.json': { name: '大学英语六级', nameEn: 'CET-6', level: 'cet6', sortOrder: 11 },
  'zhongkao.json': { name: '中考词汇', nameEn: 'Senior High School Entrance', level: 'junior', sortOrder: 2 },
  'gaokao.json': { name: '高考词汇', nameEn: 'Gaokao', level: 'senior', sortOrder: 3 },
  'kaoyan.json': { name: '考研英语词汇', nameEn: 'Postgraduate Entrance', level: 'kaoyan', sortOrder: 12 },
  'IELTS.json': { name: '雅思核心词汇', nameEn: 'IELTS', level: 'ielts', sortOrder: 13 },
  'TOEFL.json': { name: '托福核心词汇', nameEn: 'TOEFL', level: 'toefl', sortOrder: 14 },
  'xiaoxue.json': { name: '小学词汇', nameEn: 'Primary School', level: 'primary', sortOrder: 1 },
}

async function main() {
  console.log('=== 开始种子数据 ===')

  // 1. ADMIN 账号
  const adminEmail = 'admin@example.com'
  const adminExists = await prisma.user.findUnique({ where: { email: adminEmail } })
  if (!adminExists) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash('admin123456', 10),
        nickname: '管理员',
        role: 'ADMIN',
      },
    })
    console.log('✓ ADMIN 账号已创建:', adminEmail, '(密码 admin123456)')
  } else {
    console.log('- ADMIN 已存在，跳过')
  }

  // 2. 示例词书（入门 20 词）
  await importWordbookData(
    { name: '英语入门', nameEn: 'Starter', level: 'starter', sortOrder: 0 },
    STarter_WORDS as unknown as Record<string, unknown>[],
  )
  console.log('✓ 示例词书「英语入门」已导入 (20 词)')

  // 3. 示例文章
  for (const a of ARTICLES) {
    const exists = await prisma.article.findFirst({ where: { titleEn: a.titleEn } })
    if (!exists) {
      await prisma.article.create({
        data: { ...a, wordCount: a.contentMd.split(/\s+/).filter(Boolean).length },
      })
    }
  }
  console.log(`✓ 示例文章 ${ARTICLES.length} 篇`)

  // 4. 开源词书（若已下载）
  const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/wordbooks')
  if (existsSync(dataDir)) {
    for (const file of readdirSync(dataDir)) {
      const meta = OPEN_SOURCE_BOOKS[file]
      if (!meta || !file.endsWith('.json')) continue
      try {
        const words = JSON.parse(readFileSync(join(dataDir, file), 'utf-8'))
        const r = await importWordbookData(meta, words)
        console.log(`✓ 开源词书 ${meta.name}: 导入 ${r.inserted} 词 (共 ${r.wordCount})`)
      } catch (err) {
        console.warn(`✗ ${file} 导入失败:`, err)
      }
    }
  }

  console.log('=== 种子完成 ===')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
