import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.server' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000']

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}))
app.use(express.json({ limit: '50mb' }))

// Data directory
const DATA_DIR = path.join(__dirname, 'data')
const RULES_FILE = path.join(DATA_DIR, 'compliance-rules.json')
const CACHE_DIR = path.join(DATA_DIR, 'cache')

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR)
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true })
  }
  // Also ensure cache directory exists
  try {
    await fs.access(CACHE_DIR)
  } catch {
    await fs.mkdir(CACHE_DIR, { recursive: true })
  }
}

// Generate hash for file content
function generateHash(content) {
  return crypto.createHash('md5').update(content).digest('hex')
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

// Save analysis cache
app.post('/api/cache/save', async (req, res) => {
  try {
    await ensureDataDir()
    const { fileHash, manualVersion, data } = req.body
    
    if (!fileHash || !manualVersion || !data) {
      return res.status(400).json({ success: false, error: 'Missing required fields' })
    }
    
    const cacheKey = `${fileHash}_${manualVersion}`
    const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`)
    
    const cacheData = {
      fileHash,
      manualVersion,
      timestamp: new Date().toISOString(),
      ...data
    }
    
    await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2))
    console.log(`✅ Cached analysis results: ${cacheKey}`)
    res.json({ success: true, message: 'Cache saved successfully', cacheKey })
  } catch (error) {
    console.error('Error saving cache:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Load analysis cache
app.post('/api/cache/load', async (req, res) => {
  try {
    const { fileHash, manualVersion } = req.body
    
    if (!fileHash || !manualVersion) {
      return res.status(400).json({ success: false, error: 'Missing required fields' })
    }
    
    const cacheKey = `${fileHash}_${manualVersion}`
    const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`)
    
    const data = await fs.readFile(cacheFile, 'utf-8')
    const cacheData = JSON.parse(data)
    console.log(`✅ Loaded cached analysis: ${cacheKey} (from ${cacheData.timestamp})`)
    res.json({ success: true, data: cacheData, cacheKey })
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.json({ success: false, message: 'Cache not found' })
    } else {
      console.error('Error loading cache:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  }
})

// Generate hash for file content
app.post('/api/hash', async (req, res) => {
  try {
    const { content } = req.body
    
    if (!content) {
      return res.status(400).json({ success: false, error: 'Missing content' })
    }
    
    const hash = generateHash(content)
    res.json({ success: true, hash })
  } catch (error) {
    console.error('Error generating hash:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// List all cached analyses (excluding manual review caches)
app.get('/api/cache/list', async (req, res) => {
  try {
    await ensureDataDir()
    const files = await fs.readdir(CACHE_DIR)
    // Filter out manual review cache files - only show application analysis caches
    const cacheFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('manual-review-'))
    
    const cacheList = await Promise.all(
      cacheFiles.map(async (file) => {
        const filePath = path.join(CACHE_DIR, file)
        const data = await fs.readFile(filePath, 'utf-8')
        const cacheData = JSON.parse(data)
        return {
          cacheKey: file.replace('.json', ''),
          applicationName: cacheData.applicationName,
          timestamp: cacheData.timestamp,
          fileHash: cacheData.fileHash,
          manualVersion: cacheData.manualVersion
        }
      })
    )
    
    res.json({ success: true, caches: cacheList })
  } catch (error) {
    console.error('Error listing caches:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Clear specific cache
app.delete('/api/cache/clear/:cacheKey', async (req, res) => {
  try {
    const { cacheKey } = req.params
    const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`)
    
    await fs.unlink(cacheFile)
    console.log(`✅ Cleared cache: ${cacheKey}`)
    res.json({ success: true, message: 'Cache cleared successfully' })
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Cache not found' })
    } else {
      console.error('Error clearing cache:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  }
})

// Clear all caches
app.delete('/api/cache/clear-all', async (req, res) => {
  try {
    await ensureDataDir()
    const files = await fs.readdir(CACHE_DIR)
    const cacheFiles = files.filter(f => f.endsWith('.json'))
    
    await Promise.all(
      cacheFiles.map(file => fs.unlink(path.join(CACHE_DIR, file)))
    )
    
    console.log(`✅ Cleared ${cacheFiles.length} cache files`)
    res.json({ success: true, message: `Cleared ${cacheFiles.length} cache files` })
  } catch (error) {
    console.error('Error clearing all caches:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Check if manual review cache exists
app.post('/api/manual-review/check-cache', async (req, res) => {
  try {
    await ensureDataDir()
    const { filename } = req.body
    
    if (!filename) {
      return res.status(400).json({ success: false, error: 'Missing filename' })
    }
    
    // Generate cache key from filename
    const cacheKey = crypto.createHash('sha256').update(filename).digest('hex')
    const cacheFile = path.join(CACHE_DIR, `manual-review-${cacheKey}.json`)
    
    try {
      await fs.access(cacheFile)
      console.log(`✅ Manual review cache found for: ${filename}`)
      res.json({ success: true, exists: true, cacheKey })
    } catch {
      console.log(`❌ No manual review cache for: ${filename}`)
      res.json({ success: true, exists: false, cacheKey })
    }
  } catch (error) {
    console.error('Error checking manual review cache:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Load cached manual review data
app.post('/api/manual-review/load-cache', async (req, res) => {
  try {
    await ensureDataDir()
    const { cacheKey } = req.body
    
    if (!cacheKey) {
      return res.status(400).json({ success: false, error: 'Missing cacheKey' })
    }
    
    const cacheFile = path.join(CACHE_DIR, `manual-review-${cacheKey}.json`)
    const data = await fs.readFile(cacheFile, 'utf-8')
    const parsedData = JSON.parse(data)
    
    console.log(`✅ Loaded manual review cache: ${cacheKey}`)
    res.json({ 
      success: true, 
      data: parsedData.parsedElements,
      filename: parsedData.filename,
      cachedAt: parsedData.cachedAt
    })
  } catch (error) {
    console.error('Error loading manual review cache:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Save manual review parsed data to cache
app.post('/api/manual-review/save-cache', async (req, res) => {
  try {
    await ensureDataDir()
    const { filename, parsedElements } = req.body
    
    if (!filename || !parsedElements) {
      return res.status(400).json({ success: false, error: 'Missing filename or parsedElements' })
    }
    
    // Generate cache key from filename
    const cacheKey = crypto.createHash('sha256').update(filename).digest('hex')
    const cacheFile = path.join(CACHE_DIR, `manual-review-${cacheKey}.json`)
    
    const cacheData = {
      filename,
      parsedElements,
      cachedAt: new Date().toISOString()
    }
    
    await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2), 'utf-8')
    console.log(`✅ Saved manual review cache: ${filename} (${cacheKey})`)
    
    res.json({ 
      success: true, 
      message: 'Manual review cache saved successfully',
      cacheKey
    })
  } catch (error) {
    console.error('Error saving manual review cache:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Clear all manual review caches
app.post('/api/manual-review/clear-cache', async (req, res) => {
  try {
    await ensureDataDir()
    const files = await fs.readdir(CACHE_DIR)
    const manualReviewCaches = files.filter(f => f.startsWith('manual-review-') && f.endsWith('.json'))
    
    await Promise.all(
      manualReviewCaches.map(file => fs.unlink(path.join(CACHE_DIR, file)))
    )
    
    console.log(`✅ Cleared ${manualReviewCaches.length} manual review cache files`)
    res.json({ 
      success: true, 
      message: `Cleared ${manualReviewCaches.length} manual review cache files`,
      count: manualReviewCaches.length
    })
  } catch (error) {
    console.error('Error clearing manual review cache:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Save manual review content to file for analysis
app.post('/api/save-manual-review', async (req, res) => {
  try {
    await ensureDataDir()
    const { content, filename } = req.body
    
    if (!content) {
      return res.status(400).json({ success: false, error: 'Missing content' })
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const sanitizedFilename = (filename || 'manual-review').replace(/[^a-zA-Z0-9.-]/g, '_')
    const outputFilename = `manual-review-${timestamp}-${sanitizedFilename}.txt`
    const outputPath = path.join(DATA_DIR, outputFilename)
    
    await fs.writeFile(outputPath, content, 'utf-8')
    console.log(`✅ Saved manual review content to: ${outputPath}`)
    console.log(`📊 Content length: ${content.length} characters`)
    
    res.json({ 
      success: true, 
      message: 'Manual review content saved successfully',
      filepath: outputPath,
      filename: outputFilename
    })
  } catch (error) {
    console.error('Error saving manual review:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

app.listen(PORT, () => {
  console.log(`✅ Backend server running on http://localhost:${PORT}`)
  console.log(`📁 Data directory: ${DATA_DIR}`)
  console.log(`📦 Cache directory: ${CACHE_DIR}`)
})
