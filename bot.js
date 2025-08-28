// =========================
// BOT SURVIVAL AUTONOMO 🔥
// =========================
// Dipendenze da installare:
// npm i mineflayer mineflayer-pathfinder mineflayer-auto-eat mineflayer-pvp

const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const autoeat = require('mineflayer-auto-eat')   // ✅ niente .plugin
const pvp = require('mineflayer-pvp')         // ✅ niente .plugin

// ==== CONFIG SERVER ====
const bot = mineflayer.createBot({
  host: process.env.HOST,
  port: parseInt(process.env.PORT),
  username: process.env.USERNAME
})


// ==== PLUGIN ====
bot.loadPlugin(pathfinder)
bot.loadPlugin(autoeat.loader) // 👈 usa loader
bot.loadPlugin(pvp.plugin)     // 👈 usa plugin

// ==== UTILITY ====
const sleep = ms => new Promise(r => setTimeout(r, ms))
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a
const sayRandom = list => bot.chat(list[Math.floor(Math.random() * list.length)])

// helper: attendi goal raggiunto o noPath
function waitGoalReached(timeoutMs = 15000) {
  return new Promise((resolve) => {
    let done = false
    const clean = () => {
      done = true
      bot.removeListener('goal_reached', onReach)
      bot.removeListener('path_update', onUpdate)
    }
    const onReach = () => { if (!done) { clean(); resolve(true) } }
    const onUpdate = (r) => { if (r.status === 'noPath') { clean(); resolve(false) } }
    bot.once('goal_reached', onReach)
    bot.on('path_update', onUpdate)
    setTimeout(() => { if (!done) { clean(); resolve(false) } }, timeoutMs)
  })
}

// ==== STATO ====
let mcData
let doingTask = false
let shelterBuilt = false
let lastAvoidTick = 0

// ==== AVVIO ====
bot.once('spawn', () => {
  mcData = require('minecraft-data')(bot.version)

  const move = new Movements(bot, mcData)
  move.canDig = true
  move.allow1by1towers = false
  move.allowFreeMotion = false
  move.scafoldingBlocks = [] // niente bridging automatico
  bot.pathfinder.setMovements(move)

  bot.autoEat.options = {
    priority: 'foodPoints',
    startAt: 14,
    bannedFood: []
  }

  bot.chat('Eccomi! Inizio la mia survival come un vero player 🌍')
  randomIdle()
  survivalLoop() // IA autonoma
})

// ==== RICONNESSIONE SEMPLICE ====
bot.on('end', () => {
  console.log('Disconnesso. Riavvio tra 5s...')
  setTimeout(() => process.exit(1), 5000) // usa pm2 o uno script esterno per restart
})

// ==== IDLE NATURALE ====
async function randomIdle() {
  while (true) {
    try {
      if (!doingTask) {
        const pos = bot.entity.position
        const x = pos.x + rand(-8, 8)
        const z = pos.z + rand(-8, 8)
        const y = pos.y
        bot.pathfinder.setGoal(new goals.GoalBlock(Math.floor(x), Math.floor(y), Math.floor(z)))
        await waitGoalReached(8000)
      }
    } catch {}
    await sleep(rand(7000, 12000))
  }
}

// ==== CICLO SURVIVAL AUTONOMO ====
async function survivalLoop() {
  while (true) {
    try {
      doingTask = true

      // notte → rifugio
      if (isNight() && !shelterBuilt) {
        await ensureShelter()
      }

      // fame → procurati cibo
      if (bot.food < 10) {
        await tryGetFood()
      }

      // attrezzi minimi
      await ensureBasicTools()

      // mining se abbiamo un piccone, altrimenti legna
      if (hasItem(i => i.name.includes('pickaxe'))) {
        await miningRoutine()
      } else {
        await gatherWood(2)
      }
    } catch (e) {
      console.log('Errore nel survival loop:', e?.message)
    } finally {
      doingTask = false
      await sleep(3000)
    }
  }
}

// ==== CHECK NOTTE ====
function isNight() {
  if (!bot.time) return false
  const t = bot.time.timeOfDay // 0..24000
  return (t > 13000 && t < 23000)
}

// ==== INVENTARIO HELPERS ====
function hasItem(predicate) {
  return bot.inventory.items().some(predicate)
}
function countItem(namePartPredicate) {
  return bot.inventory.items()
    .filter(i => namePartPredicate(i.name))
    .reduce((a, b) => a + b.count, 0)
}
async function equipIfHas(predicate, dest = 'hand') {
  const it = bot.inventory.items().find(predicate)
  if (!it) return false
  try { await bot.equip(it, dest); return true } catch { return false }
}

// ==== MOVIMENTO GOTO ====
async function gotoBlockPos(p) {
  bot.pathfinder.setGoal(new goals.GoalBlock(p.x, p.y, p.z))
  return await waitGoalReached(15000)
}

// ==== RACCOLTA LEGNA ====
async function gatherWood(minLogs = 4) {
  const findLog = () => bot.findBlock({
    matching: b => b && b.name && b.name.includes('log'),
    maxDistance: 32
  })

  let attempts = 0
  while (countItem(part => part.includes('log')) < minLogs && attempts < 6) {
    const log = findLog()
    if (!log) { attempts++; await sleep(2000); continue }
    await gotoBlockPos(log.position)
    await faceBlock(log)
    await toolOrHand('axe')
    try { await digSafe(log) } catch {}
    await sleep(400)
  }
}

async function faceBlock(block) {
  try { await bot.lookAt(block.position.offset(0.5, 0.5, 0.5)) } catch {}
}
async function toolOrHand(type) {
  const ok = await equipIfHas(i => i.name.includes(type), 'hand')
  return !!ok
}
async function digSafe(block) {
  const held = bot.heldItem
  if (held && held.maxDurability && held.durabilityUsed / held.maxDurability > 0.85) {
    bot.chat('/repair all')
    await sleep(250)
  }
  return bot.dig(block, true)
}

// ==== CRAFTING BASE ====
const LOG_TO_PLANKS = [
  { log: 'oak_log',       planks: 'oak_planks' },
  { log: 'spruce_log',    planks: 'spruce_planks' },
  { log: 'birch_log',     planks: 'birch_planks' },
  { log: 'jungle_log',    planks: 'jungle_planks' },
  { log: 'acacia_log',    planks: 'acacia_planks' },
  { log: 'dark_oak_log',  planks: 'dark_oak_planks' },
  { log: 'mangrove_log',  planks: 'mangrove_planks' },
  { log: 'cherry_log',    planks: 'cherry_planks' },
]

function pickPlanksIdFromInventory() {
  const logs = bot.inventory.items().filter(i => i.name.includes('log'))
  if (logs.length === 0) return null
  const match = LOG_TO_PLANKS.find(m => logs[0].name.includes(m.log))
  if (!match || !mcData.itemsByName[match.planks]) return null
  return mcData.itemsByName[match.planks].id
}

async function ensureCraftingTable() {
  const tableId = mcData.itemsByName.crafting_table.id
  if (!hasItem(i => i.type === tableId)) {
    await craftPlanksIfNeeded(4)
    const recipe = bot.recipesFor(tableId, null, 1, null)[0]
    if (recipe) {
      try { await bot.craft(recipe, 1, null); bot.chat('Crafting table pronta 🛠️') } catch {}
    }
  }
}

async function craftPlanksIfNeeded(minPlanks = 4) {
  const plankCount = countItem(n => n.includes('planks'))
  if (plankCount >= minPlanks) return
  const log = bot.inventory.items().find(i => i.name.includes('log'))
  if (!log) { await gatherWood(2); return craftPlanksIfNeeded(minPlanks) }
  const plankId = pickPlanksIdFromInventory()
  if (!plankId) return
  const recipe = bot.recipesFor(plankId, null, 1, null)[0]
  if (recipe) { try { await bot.craft(recipe, 1, null) } catch {} }
}

async function craftSticksIfNeeded(minSticks = 4) {
  const stickId = mcData.itemsByName.stick.id
  const sticks = bot.inventory.items().filter(i => i.type === stickId).reduce((a,b)=>a+b.count,0)
  if (sticks >= minSticks) return
  await craftPlanksIfNeeded(4)
  const recipe = bot.recipesFor(stickId, null, 1, null)[0]
  if (recipe) { try { await bot.craft(recipe, 1, null) } catch {} }
}

async function ensureBasicTools() {
  if (hasItem(i => i.name.includes('pickaxe'))) return
  bot.chat('Mi preparo gli attrezzi 🧰')
  await ensureCraftingTable()
  await craftPlanksIfNeeded(8)
  await craftSticksIfNeeded(4)

  const tableBlock = bot.findBlock({ matching: mcData.blocksByName.crafting_table.id, maxDistance: 6 })
  const craftAt = tableBlock || null
  const woodenPickId = mcData.itemsByName.wooden_pickaxe.id
  const stonePickId = mcData.itemsByName.stone_pickaxe.id
  const hasCobble = countItem(n => n.includes('cobblestone')) >= 3

  if (hasCobble) {
    const recipe = bot.recipesFor(stonePickId, null, 1, craftAt)[0]
    if (recipe) { try { await bot.craft(recipe, 1, craftAt); bot.chat('Piccone di pietra craftato ⛏️') } catch {} }
  } else {
    const recipe = bot.recipesFor(woodenPickId, null, 1, craftAt)[0]
    if (recipe) { try { await bot.craft(recipe, 1, craftAt); bot.chat('Piccone di legno craftato ⛏️') } catch {} }
  }
}

// ==== MINING ROUTINE ====
async function miningRoutine() {
  const y = Math.floor(bot.entity.position.y)
  if (y > 12) {
    bot.chat('Scendo in miniera fino al livello 12 ⬇️')
    for (let i = 0; i < Math.min(8, y - 12); i++) {
      const under = bot.blockAt(bot.entity.position.offset(0, -1, 0))
      if (under) { try { await digSafe(under) } catch {} }
      await sleep(150)
    }
    return
  }

  // cerca minerali vicini
  const ore = bot.findBlock({
    matching: b => b && b.name && (
      b.name.includes('coal_ore') || b.name.includes('iron_ore') || b.name.includes('diamond_ore') ||
      b.name.includes('copper_ore') || b.name.includes('redstone_ore') || b.name.includes('lapis_ore')
    ),
    maxDistance: 16
  })

  if (ore) {
    bot.chat('Minerale individuato, vado a prenderlo 💎')
    await gotoBlockPos(ore.position)
    await faceBlock(ore)
    await toolOrHand('pickaxe')
    try { await digSafe(ore) } catch {}
    await sleep(200)
    return
  }

  // tunnel semplice
  const dir = forwardOffset()
  const front = bot.blockAt(bot.entity.position.offset(dir.x, dir.y, dir.z))
  if (front && front.name !== 'air') {
    await toolOrHand('pickaxe')
    try { await digSafe(front) } catch {}
  } else {
    bot.setControlState('forward', true)
    await sleep(400)
    bot.setControlState('forward', false)
  }

  await maybePlaceTorch()
}

function forwardOffset() {
  const yaw = bot.entity.yaw
  const dx = Math.round(Math.cos(yaw))
  const dz = Math.round(Math.sin(yaw))
  return { x: dx, y: 0, z: dz }
}

async function maybePlaceTorch() {
  const torch = bot.inventory.items().find(i => i.name.includes('torch'))
  if (!torch) return
  // piazza torcia se è notte o se Y < 40 (grezzo)
  if (isNight() || bot.entity.position.y < 40) {
    const under = bot.blockAt(bot.entity.position.offset(0, -1, 0))
    if (!under || under.name === 'air') return
    try {
      await bot.equip(torch, 'hand')
      await bot.placeBlock(under, { x: 0, y: 1, z: 0 })
      await sleep(80)
    } catch {}
  }
}

// ==== CIBO: CACCIA SEMPLICE ====
async function tryGetFood() {
  const target = bot.nearestEntity(e =>
    e?.type === 'mob' && ['Cow','Chicken','Pig','Sheep'].includes(e.name)
  )
  if (target) {
    bot.chat('Vado a prendere un po’ di cibo 🍖')
    bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true)
    await sleep(600)
    if (distanceTo(target) <= 3.2) {
      bot.pvp.attack(target)
      await sleep(2500)
    }
    return
  }
  bot.chat('Mi serve cibo… se ne hai, passamelo per favore 🙏')
}

// ==== SHELTER NOTTURNO ====
async function ensureShelter() {
  bot.chat('Sta facendo notte, costruisco un rifugio 🏠')
  await craftPlanksIfNeeded(12)
  let blockForBuild = bot.inventory.items().find(i => i.name.includes('planks') || i.name.includes('cobblestone'))
  if (!blockForBuild) {
    bot.chat('Non ho materiali per il rifugio, raccolgo legna 🌲')
    await gatherWood(4)
    blockForBuild = bot.inventory.items().find(i => i.name.includes('planks') || i.name.includes('cobblestone'))
    if (!blockForBuild) { bot.chat('Materiali ancora insufficienti, salto il rifugio per ora.'); return }
  }

  const base = bot.blockAt(bot.entity.position.offset(0, -1, 0))
  if (!base || base.name === 'air') { bot.chat('Terreno instabile, rinuncio al rifugio.'); return }

  try { await bot.equip(blockForBuild, 'hand') } catch {}

  // box 3x3 alto 2 + tetto
  const basePos = bot.entity.position.floored()
  for (let y = 0; y < 2; y++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const edge = (Math.abs(dx) === 1 || Math.abs(dz) === 1)
        if (!edge) continue
        const below = bot.blockAt(basePos.offset(dx, y - 1, dz))
        const here = bot.blockAt(basePos.offset(dx, y, dz))
        if (below && here && here.name === 'air') {
          try { await bot.placeBlock(below, { x: 0, y: 1, z: 0 }) } catch {}
          await sleep(60)
        }
      }
    }
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const below = bot.blockAt(basePos.offset(dx, 1, dz))
      const top = bot.blockAt(basePos.offset(dx, 2, dz))
      if (below && top && top.name === 'air') {
        try { await bot.placeBlock(below, { x: 0, y: 1, z: 0 }) } catch {}
        await sleep(60)
      }
    }
  }
  shelterBuilt = true
  bot.chat('Rifugio pronto! Metto una torcia 🕯️')
  await maybePlaceTorch()
}

// =====================
// COMBAT E SICUREZZA
// =====================
bot.on('physicsTick', () => {
  const now = Date.now()

  // evita creeper (throttle)
  const creeper = bot.nearestEntity(e => e?.name === 'Creeper')
  if (creeper && distanceTo(creeper) < 6 && (now - lastAvoidTick > 500)) {
    lastAvoidTick = now
    const pos = bot.entity.position
    const away = pos.offset(-3, 0, -3)
    bot.pathfinder.setGoal(new goals.GoalBlock(away.x, away.y, away.z))
  }

  // attacca mob ostili se troppo vicini
  const hostile = bot.nearestEntity(e => e?.type === 'mob' && ['Zombie','Skeleton','Spider'].includes(e.name))
  if (hostile && distanceTo(hostile) < 3) {
    bot.pvp.attack(hostile)
  }
})

function distanceTo(entity) {
  const p = bot.entity.position
  const q = entity.position
  const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z
  return Math.sqrt(dx*dx + dy*dy + dz*dz)
}

// =====================
// COMANDI (OPZIONALI)
// =====================
bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  // conversazione naturale se non è un comando
  if (!message.startsWith('!')) {
    const replies = [
      'Sisi tranquillo 😎',
      'Eh già!',
      'Perfetto fratè 🔥',
      'Interessante 👀',
      'Ci sto 💪',
      'Okok'
    ]
    sayRandom(replies)
    return
  }

  if (message === '!ciao') bot.chat(`Ciao ${username}! 👋`)

  if (message.startsWith('!cammina')) {
    const a = message.split(' ')
    if (a.length === 4) {
      const x = parseInt(a[1]), y = parseInt(a[2]), z = parseInt(a[3])
      bot.pathfinder.setGoal(new goals.GoalBlock(x, y, z))
      bot.chat(`Ok, vado a ${x} ${y} ${z}`)
    }
  }

  if (message.startsWith('!segui')) {
    const name = message.split(' ')[1]
    const target = bot.players[name]?.entity
    if (!target) return bot.chat('Non vedo quel giocatore ❌')
    bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true)
    bot.chat(`Ti seguo, ${name} 👣`)
  }

  if (message === '!scava') {
    bot.chat('Si papa! ⛏️')
    const block = bot.blockAt(bot.entity.position.offset(0, -1, 0))
    if (block) try { await digSafe(block); bot.chat('Scavato ✅') } catch { bot.chat('Errore ❌') }
  }

  if (message === '!casa') {
    shelterBuilt = false
    await ensureShelter()
  }

  if (message === '!bridge') {
    bot.chat('Per ora evito il bridging automatico per non piazzare blocchi a caso 😉')
  }

  if (message === '!scavamontagna') {
    bot.chat('Ok, scavo davanti a me ⛰️')
    for (let i = 0; i < 24; i++) {
      const dir = forwardOffset()
      const front = bot.blockAt(bot.entity.position.offset(dir.x, 0, dir.z))
      if (!front || front.name === 'air') break
      await toolOrHand('pickaxe')
      try { await digSafe(front) } catch {}
      await sleep(150)
    }
    bot.chat('Fatto ✅')
  }
})

// =====================
// EVENTI VARI
// =====================
bot.on('death', () => {
  sayRandom(['Ahia che botta 💀', 'RIP me 🪦', 'Sono morto… 😵'])
})

bot.on('error', (e) => {
  console.log('Errore bot:', e?.message)
})
