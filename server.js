import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = 3001

// Middleware
app.use(cors())
app.use(express.json({ limit: '50mb' }))

// Data directory
const DATA_DIR = path.join(__dirname, 'data')
const RULES_FILE = path.join(DATA_DIR, 'compliance-rules.json')

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR)
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true })
  }
}

// Save compliance rules
app.post('/api/save-rules', async (req, res) => {
  try {
    await ensureDataDir()
    const rules = req.body.rules
    await fs.writeFile(RULES_FILE, JSON.stringify(rules, null, 2))
    console.log(`✅ Saved ${rules.length} compliance rules to ${RULES_FILE}`)
    res.json({ success: true, message: 'Rules saved successfully' })
  } catch (error) {
    console.error('Error saving rules:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Load compliance rules
app.get('/api/load-rules', async (req, res) => {
  try {
    const data = await fs.readFile(RULES_FILE, 'utf-8')
    const rules = JSON.parse(data)
    console.log(`✅ Loaded ${rules.length} compliance rules from ${RULES_FILE}`)
    res.json({ success: true, rules })
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No saved rules found')
      res.json({ success: false, message: 'No saved rules found' })
    } else {
      console.error('Error loading rules:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  }
})

app.listen(PORT, () => {
  console.log(`✅ Backend server running on http://localhost:${PORT}`)
  console.log(`📁 Data directory: ${DATA_DIR}`)
})
