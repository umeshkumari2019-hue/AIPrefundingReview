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

// Load compliance rules (default - backward compatible)
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

// Save compliance rules for a specific year (e.g., /api/save-rules/26)
app.post('/api/save-rules/:year', async (req, res) => {
  try {
    const { year } = req.params
    const yearDir = path.join(DATA_DIR, year)
    await fs.mkdir(yearDir, { recursive: true })
    
    const rulesFile = path.join(yearDir, 'compliance-rules.json')
    const rules = req.body.rules
    await fs.writeFile(rulesFile, JSON.stringify(rules, null, 2))
    console.log(`✅ Saved ${rules.length} compliance rules to ${rulesFile}`)
    res.json({ success: true, message: `Rules saved for year ${year}`, year })
  } catch (error) {
    console.error('Error saving rules:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Load compliance rules for a specific year (e.g., /api/load-rules/26)
app.get('/api/load-rules/:year', async (req, res) => {
  try {
    const { year } = req.params
    const rulesFile = path.join(DATA_DIR, year, 'compliance-rules.json')
    const data = await fs.readFile(rulesFile, 'utf-8')
    const rules = JSON.parse(data)
    console.log(`✅ Loaded ${rules.length} compliance rules for year ${year}`)
    res.json({ success: true, rules, year })
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`No saved rules found for year ${req.params.year}`)
      res.json({ success: false, message: `No rules found for year ${req.params.year}` })
    } else {
      console.error('Error loading rules:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  }
})

// List all available rule years
app.get('/api/rule-years', async (req, res) => {
  try {
    await ensureDataDir()
    const entries = await fs.readdir(DATA_DIR, { withFileTypes: true })
    const years = []
    
    for (const entry of entries) {
      if (entry.isDirectory() && /^\d{2}$/.test(entry.name)) {
        // Check if this folder has a compliance-rules.json
        const rulesFile = path.join(DATA_DIR, entry.name, 'compliance-rules.json')
        try {
          await fs.access(rulesFile)
          const data = await fs.readFile(rulesFile, 'utf-8')
          const rules = JSON.parse(data)
          years.push({
            year: entry.name,
            fullYear: `20${entry.name}`,
            chaptersCount: rules.length
          })
        } catch {
          // Folder exists but no rules file
        }
      }
    }
    
    years.sort((a, b) => parseInt(a.year) - parseInt(b.year))
    console.log(`✅ Found rules for ${years.length} years: ${years.map(y => y.fullYear).join(', ')}`)
    res.json({ success: true, years })
  } catch (error) {
    console.error('Error listing rule years:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Save extracted application text for review
app.post('/api/save-extracted-text', async (req, res) => {
  try {
    await ensureDataDir()
    const { filename, content } = req.body
    
    if (!content) {
      return res.status(400).json({ success: false, error: 'Missing content' })
    }
    
    const extractedDir = path.join(DATA_DIR, 'extracted-text')
    await fs.mkdir(extractedDir, { recursive: true })
    
    const sanitizedFilename = (filename || 'application').replace(/[^a-zA-Z0-9.-]/g, '_')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outputFilename = `${sanitizedFilename}_${timestamp}.txt`
    const outputPath = path.join(extractedDir, outputFilename)
    
    await fs.writeFile(outputPath, content, 'utf-8')
    console.log(`✅ Saved extracted text: ${outputFilename} (${content.length} chars)`)
    
    res.json({ 
      success: true, 
      message: 'Extracted text saved',
      filepath: outputPath,
      filename: outputFilename
    })
  } catch (error) {
    console.error('Error saving extracted text:', error)
    res.status(500).json({ success: false, error: error.message })
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

// Clear specific cache by cacheKey parameter
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

// Delete specific cache by fileHash and manualVersion
app.delete('/api/cache/delete', async (req, res) => {
  try {
    const { fileHash, manualVersion } = req.body
    
    if (!fileHash || !manualVersion) {
      return res.status(400).json({ success: false, error: 'Missing fileHash or manualVersion' })
    }
    
    const cacheKey = `${fileHash}_${manualVersion}`
    const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`)
    
    await fs.unlink(cacheFile)
    console.log(`✅ Deleted cache: ${cacheKey}`)
    res.json({ success: true, message: 'Cache deleted successfully' })
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Cache not found' })
    } else {
      console.error('Error deleting cache:', error)
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

// Remove duplicate cache files
app.post('/api/cache/remove-duplicates', async (req, res) => {
  try {
    await ensureDataDir()
    const files = await fs.readdir(CACHE_DIR)
    const jsonFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('manual-review-'))
    
    // Map to track application numbers and their cache files
    const appMap = new Map()
    
    // Read all cache files and group by application number
    for (const filename of jsonFiles) {
      try {
        const filePath = path.join(CACHE_DIR, filename)
        const data = JSON.parse(await fs.readFile(filePath, 'utf8'))
        
        const appNumber = data.applicationNumber
        
        if (!appNumber) continue
        
        if (!appMap.has(appNumber)) {
          appMap.set(appNumber, [])
        }
        
        appMap.get(appNumber).push({
          filename,
          filePath,
          timestamp: data.timestamp || new Date(0).toISOString(),
          applicationName: data.applicationName
        })
      } catch (error) {
        console.error(`Error reading ${filename}:`, error.message)
      }
    }
    
    // Find and remove duplicates
    let duplicatesFound = 0
    let filesDeleted = 0
    const deletedFiles = []
    
    for (const [appNumber, entries] of appMap.entries()) {
      if (entries.length > 1) {
        duplicatesFound++
        
        // Sort by timestamp (newest first)
        entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        
        // Keep the newest, delete the rest
        const [keep, ...toDelete] = entries
        
        console.log(`Keeping: ${keep.filename} for app ${appNumber}`)
        
        for (const entry of toDelete) {
          await fs.unlink(entry.filePath)
          deletedFiles.push(entry.filename)
          filesDeleted++
          console.log(`Deleted: ${entry.filename}`)
        }
      }
    }
    
    res.json({ 
      success: true, 
      duplicatesFound,
      filesDeleted,
      deletedFiles,
      message: `Removed ${filesDeleted} duplicate files from ${duplicatesFound} applications`
    })
  } catch (error) {
    console.error('Error removing duplicates:', error)
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

// Serve static files from React build (for production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')))
  
  // Handle React routing - send all non-API requests to index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`✅ Backend server running on http://localhost:${PORT}`)
  console.log(`📁 Data directory: ${DATA_DIR}`)
  console.log(`📦 Cache directory: ${CACHE_DIR}`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
})
