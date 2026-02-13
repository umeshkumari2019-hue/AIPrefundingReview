import { useState, useEffect } from 'react'
import axios from 'axios'
import * as XLSX from 'xlsx'
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer, Table, TableCell, TableRow, WidthType, BorderStyle } from 'docx'
import { saveAs } from 'file-saver'
import PDFViewer from './components/PDFViewer'
import Login from './components/Login'

// Azure Document Intelligence configuration
const AZURE_DOC_ENDPOINT = import.meta.env.VITE_AZURE_DOC_ENDPOINT || ''
const AZURE_DOC_KEY = import.meta.env.VITE_AZURE_DOC_KEY || ''

// Azure OpenAI configuration
const AZURE_OPENAI_ENDPOINT = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT || ''
const AZURE_OPENAI_KEY = import.meta.env.VITE_AZURE_OPENAI_KEY || ''
const AZURE_OPENAI_DEPLOYMENT = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT || 'gpt-4'

// Backend server configuration
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''

// Log configuration sources (without exposing secrets)
console.log('🔧 Azure Configuration Sources:')
console.log('  📄 Document Intelligence Endpoint:', import.meta.env.VITE_AZURE_DOC_ENDPOINT ? '✅ From Environment Variable' : '⚠️ Using Fallback/Hardcoded Value')
console.log('  🔑 Document Intelligence Key:', import.meta.env.VITE_AZURE_DOC_KEY ? '✅ From Environment Variable' : '⚠️ Using Fallback/Hardcoded Value')
console.log('  🤖 OpenAI Endpoint:', import.meta.env.VITE_AZURE_OPENAI_ENDPOINT ? '✅ From Environment Variable' : '⚠️ Using Fallback/Hardcoded Value')
console.log('  🔑 OpenAI Key:', import.meta.env.VITE_AZURE_OPENAI_KEY ? '✅ From Environment Variable' : '⚠️ Using Fallback/Hardcoded Value')
console.log('  🚀 OpenAI Deployment:', import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT ? '✅ From Environment Variable' : '⚠️ Using Fallback/Hardcoded Value')
console.log('  🌐 Backend URL:', import.meta.env.VITE_BACKEND_URL ? '✅ From Environment Variable' : '⚠️ Using Fallback/Hardcoded Value')
console.log('  📍 Endpoint URLs:', { 
  docIntelligence: AZURE_DOC_ENDPOINT, 
  openAI: AZURE_OPENAI_ENDPOINT,
  backend: BACKEND_URL || 'Not configured'
})

const SECTIONS = [
  'Sliding Fee Discount Program',
  'Key Management Staff',
  'Contracts and Subawards',
  'Collaborative Relationships',
  'Billing and Collections',
  'Budget',
  'Board Authority',
  'Board Composition'
]

// Text compression utility to reduce API payload size
const compressApplicationText = (fullText) => {
  let compressed = fullText
  
  // Remove page markers and separators
  compressed = compressed.replace(/={10,}/g, '')
  compressed = compressed.replace(/PAGE \d+/gi, '')
  compressed = compressed.replace(/Page Number:\s*\d+/gi, '')
  compressed = compressed.replace(/Tracking Number[^\n]*/gi, '')
  
  // Remove excessive whitespace and blank lines
  compressed = compressed.replace(/\n{3,}/g, '\n\n')
  compressed = compressed.replace(/[ \t]{2,}/g, ' ')
  compressed = compressed.replace(/^\s+$/gm, '') // Remove whitespace-only lines
  
  // Remove page headers/footers (common patterns)
  compressed = compressed.replace(/Page \d+ of \d+/gi, '')
  compressed = compressed.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, '') // Dates
  
  // Remove table formatting characters but keep content
  compressed = compressed.replace(/[│┤├┼─┌┐└┘]/g, ' ')
  compressed = compressed.replace(/\[TEXT\]\s*/g, '') // Remove [TEXT] markers
  compressed = compressed.replace(/\[TABLE[^\]]*\]:\s*/g, 'TABLE: ') // Simplify table markers
  
  // Remove excessive repetition (e.g., "___________" lines)
  compressed = compressed.replace(/_{5,}/g, '')
  compressed = compressed.replace(/-{5,}/g, '')
  compressed = compressed.replace(/\.{5,}/g, '')
  
  // Remove multiple spaces (do this last)
  compressed = compressed.replace(/  +/g, ' ')
  compressed = compressed.replace(/\n /g, '\n') // Remove leading spaces on lines
  
  // Remove empty lines
  compressed = compressed.split('\n').filter(line => line.trim().length > 0).join('\n')
  
  return compressed.trim()
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [manualFile, setManualFile] = useState(null)
  const [applicationFile, setApplicationFile] = useState(null)
  const [applicationName, setApplicationName] = useState('')
  const [status, setStatus] = useState('')
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState(null)
  const [manualRules, setManualRules] = useState(null)
  const [expandedDetails, setExpandedDetails] = useState({})
  const [cacheStatus, setCacheStatus] = useState('')
  const [applicationFileHash, setApplicationFileHash] = useState(null)
  const [manualVersion, setManualVersion] = useState('v1.0')
  const [navigationMode, setNavigationMode] = useState(null) // 'compliance' or 'non-compliance'
  const [currentItemIndex, setCurrentItemIndex] = useState(0)
  const [highlightedItemId, setHighlightedItemId] = useState(null)
  const [filterStatus, setFilterStatus] = useState(null) // 'compliant', 'non-compliant', 'not-applicable', or null for all
  const [speechStatus, setSpeechStatus] = useState({}) // Track speech status for each item
  const [cachedApplications, setCachedApplications] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(12) // Show 12 applications per page
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('')
  const [manualReviewFile, setManualReviewFile] = useState(null)
  const [manualReviewContent, setManualReviewContent] = useState('')
  const [manualReviewParsed, setManualReviewParsed] = useState([])
  const [showComparison, setShowComparison] = useState(false)
  const [expandedEvidence, setExpandedEvidence] = useState({})
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showPDFViewer, setShowPDFViewer] = useState(false)
  const [highlightPDFPage, setHighlightPDFPage] = useState(null)
  const [highlightText, setHighlightText] = useState(null)
  const [pdfFile, setPdfFile] = useState(null)
  const [progressLog, setProgressLog] = useState([])
  const [manualYear, setManualYear] = useState(new Date().getFullYear().toString()) // Year for manual upload dropdown
  const [availableRuleYears, setAvailableRuleYears] = useState([]) // Years that have saved rules
  const [activeRuleYear, setActiveRuleYear] = useState('') // Which year's rules are currently loaded
  const [detectedRuleYear, setDetectedRuleYear] = useState('') // Year detected from application announcement number

  // Check for stored authentication on mount
  useEffect(() => {
    const storedAuth = localStorage.getItem('hrsaAuth')
    if (storedAuth) {
      try {
        const authData = JSON.parse(storedAuth)
        setIsAuthenticated(true)
        setCurrentUser(authData)
      } catch (error) {
        localStorage.removeItem('hrsaAuth')
      }
    }
  }, [])

  // Load saved compliance rules from JSON file on mount (only if authenticated)
  useEffect(() => {
    if (isAuthenticated) {
      loadSavedRules()
      loadCachedApplications()
      loadAvailableRuleYears()
    }
  }, [isAuthenticated])

  // Keyboard navigation for Enter key
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Enter' && navigationMode && activeTab === 'results') {
        navigateToNextItem()
      }
    }
    
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [navigationMode, currentItemIndex, activeTab, results])

  // Navigation functions
  const getAllItemsOfType = (type) => {
    const items = []
    if (!results) return items
    
    SECTIONS.forEach(section => {
      const result = results[section]
      if (result) {
        let itemList
        if (type === 'compliance') {
          itemList = result.compliantItems
        } else if (type === 'non-compliance') {
          itemList = result.nonCompliantItems
        } else if (type === 'not-applicable') {
          itemList = result.notApplicableItems
        }
        
        if (itemList) {
          itemList.forEach((item, idx) => {
            items.push({
              section,
              item,
              index: idx,
              id: `${section}-${type}-${idx}`
            })
          })
        }
      }
    })
    return items
  }

  const handleSummaryCardClick = (type) => {
    setNavigationMode(type)
    setCurrentItemIndex(0)
    const items = getAllItemsOfType(type)
    if (items.length > 0) {
      scrollToItem(items[0])
    }
  }

  const navigateToNextItem = () => {
    if (!navigationMode) return
    
    const items = getAllItemsOfType(navigationMode)
    if (items.length === 0) return
    
    const nextIndex = (currentItemIndex + 1) % items.length
    setCurrentItemIndex(nextIndex)
    scrollToItem(items[nextIndex])
  }

  const scrollToItem = (itemData) => {
    if (!itemData) return
    
    setHighlightedItemId(itemData.id)
    
    // Expand the chapter first
    const chapterKey = `chapter-${itemData.section}`
    setExpandedDetails(prev => ({...prev, [chapterKey]: true}))
    
    // Wait for render, then scroll
    setTimeout(() => {
      const element = document.getElementById(itemData.id)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
    
    // Remove highlight after 3 seconds
    setTimeout(() => {
      setHighlightedItemId(null)
    }, 3000)
  }

  // Generate hash for file content
  const generateFileHash = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      
      // Convert to base64 in chunks to avoid stack overflow
      let base64 = ''
      const chunkSize = 8192 // Process 8KB at a time
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize)
        base64 += String.fromCharCode.apply(null, chunk)
      }
      const base64Encoded = btoa(base64)
      
      const response = await axios.post(`${BACKEND_URL}/api/hash`, { content: base64Encoded })
      return response.data.hash
    } catch (error) {
      console.error('Error generating file hash:', error)
      return null
    }
  }

  // Check cache for existing analysis
  const checkCache = async (fileHash, manualVer) => {
    try {
      const response = await axios.post(`${BACKEND_URL}/api/cache/load`, {
        fileHash,
        manualVersion: manualVer
      })
      
      if (response.data.success) {
        return response.data.data
      }
      return null
    } catch (error) {
      console.error('Error checking cache:', error)
      return null
    }
  }

  // Save analysis to cache
  const saveToCache = async (fileHash, manualVer, data) => {
    try {
      await axios.post(`${BACKEND_URL}/api/cache/save`, {
        fileHash,
        manualVersion: manualVer,
        data
      })
      console.log('✅ Analysis saved to cache')
    } catch (error) {
      console.error('Error saving to cache:', error)
    }
  }

  // Extract page number from evidence location (returns first page found)
  const extractPageNumber = (evidenceLocation) => {
    if (!evidenceLocation) return null
    
    // Try to match patterns like "Page 5", "page 5", "p. 5", "pg 5"
    const patterns = [
      /page\s+(\d+)/i,
      /p\.?\s*(\d+)/i,
      /pg\.?\s*(\d+)/i
    ]
    
    for (const pattern of patterns) {
      const match = evidenceLocation.match(pattern)
      if (match && match[1]) {
        return parseInt(match[1], 10)
      }
    }
    
    // Try bare number
    const bareNum = evidenceLocation.match(/(\d+)/)
    if (bareNum) return parseInt(bareNum[1], 10)
    
    return null
  }

  // Parse all page numbers from evidence location string
  // Handles: "Page 133, 151", "Pages 131-135", "Page 45, 93, 102", "Pages 10-12, 45"
  const parsePageNumbers = (evidenceLocation) => {
    if (!evidenceLocation) return []
    
    const pages = []
    
    // Remove "Page" / "Pages" / "p." / "pg" prefix
    const cleaned = evidenceLocation.replace(/pages?\s*/gi, '').replace(/p\.?\s*/gi, '').replace(/pg\.?\s*/gi, '').trim()
    
    // Split by comma or "and"
    const parts = cleaned.split(/[,&]|\band\b/).map(p => p.trim()).filter(p => p.length > 0)
    
    for (const part of parts) {
      // Check for range like "131-135"
      const rangeMatch = part.match(/(\d+)\s*[-–—]\s*(\d+)/)
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10)
        const end = parseInt(rangeMatch[2], 10)
        if (start <= end && end - start < 50) {
          for (let i = start; i <= end; i++) {
            pages.push(i)
          }
        }
        continue
      }
      
      // Single number
      const numMatch = part.match(/(\d+)/)
      if (numMatch) {
        pages.push(parseInt(numMatch[1], 10))
      }
    }
    
    // Remove duplicates and sort
    return [...new Set(pages)].sort((a, b) => a - b)
  }

  // Navigate to evidence in PDF
  const navigateToEvidence = (evidenceLocation, evidenceText) => {
    if (!pdfFile) {
      // No PDF loaded - prompt user to upload
      document.getElementById('pdf-reupload-input')?.click()
      return
    }
    const pageNumber = extractPageNumber(evidenceLocation)
    if (pageNumber) {
      // Reset first to force re-trigger if same page is clicked again
      setHighlightPDFPage(null)
      setHighlightText(null)
      setTimeout(() => {
        setShowPDFViewer(true)
        setHighlightPDFPage(pageNumber)
        setHighlightText(evidenceText)
      }, 50)
    } else {
      alert('Could not extract page number from evidence location')
    }
  }

  // Handle PDF re-upload for cached applications
  const handlePdfReupload = (e) => {
    const file = e.target.files[0]
    if (file && file.type === 'application/pdf') {
      setPdfFile(file)
      setApplicationFile(file)
    }
  }

  // Store PDF file when application is uploaded
  useEffect(() => {
    if (applicationFile) {
      setPdfFile(applicationFile)
    }
  }, [applicationFile])

  // Clear all caches
  const clearAllCaches = async () => {
    try {
      const response = await axios.delete(`${BACKEND_URL}/api/cache/clear-all`)
      if (response.data.success) {
        setCacheStatus('🗑️ All caches cleared')
        setTimeout(() => setCacheStatus(''), 3000)
      }
    } catch (error) {
      console.error('Error clearing caches:', error)
      setCacheStatus('❌ Error clearing caches')
    }
  }

  const loadAvailableRuleYears = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/rule-years`)
      if (response.data.success) {
        setAvailableRuleYears(response.data.years)
        console.log('Available rule years:', response.data.years.map(y => y.fullYear).join(', '))
      }
    } catch (error) {
      console.log('Could not load available rule years')
    }
  }

  const loadSavedRules = async (year = null) => {
    try {
      const url = year 
        ? `${BACKEND_URL}/api/load-rules/${year}` 
        : `${BACKEND_URL}/api/load-rules`
      const response = await axios.get(url)
      if (response.data.success) {
        setManualRules(response.data.rules)
        if (year) {
          setActiveRuleYear(year)
          setStatus(`✅ Loaded compliance rules for 20${year}`)
        } else {
          setStatus('✅ Loaded saved compliance rules from file')
        }
        console.log('Loaded rules from file:', response.data.rules.length, 'chapters', year ? `(year: 20${year})` : '')
      }
    } catch (error) {
      console.log('No saved rules found or backend not running')
    }
  }

  const loadCachedApplications = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/cache/list`)
      if (response.data.success) {
        // Sort by timestamp descending (most recent first)
        const sortedCaches = response.data.caches.sort((a, b) => 
          new Date(b.timestamp) - new Date(a.timestamp)
        )
        setCachedApplications(sortedCaches)
        console.log('Loaded cached applications:', sortedCaches.length)
      }
    } catch (error) {
      console.error('Error loading cached applications:', error)
    }
  }

  const viewCachedApplication = async (cacheKey) => {
    try {
      const cache = cachedApplications.find(c => c.cacheKey === cacheKey)
      if (!cache) return
      
      const response = await axios.post(`${BACKEND_URL}/api/cache/load`, {
        fileHash: cache.fileHash,
        manualVersion: cache.manualVersion
      })
      
      if (response.data.success) {
        const cacheData = response.data.data
        
        // Backfill requirement text for existing cached results
        if (cacheData.results && manualRules && manualRules.length > 0) {
          Object.keys(cacheData.results).forEach(section => {
            const sectionData = cacheData.results[section]
            const chapter = manualRules.find(r => r.section === section || section.includes(r.section) || r.section.includes(section))
            
            if (chapter && chapter.elements) {
              // Update compliant items
              sectionData.compliantItems?.forEach(item => {
                if (!item.requirement || item.requirement === 'Unknown') {
                  const element = chapter.elements.find(e => e.element === item.element)
                  if (element) {
                    item.requirement = element.requirementText || item.element
                  }
                }
              })
              
              // Update non-compliant items
              sectionData.nonCompliantItems?.forEach(item => {
                if (!item.requirement || item.requirement === 'Unknown') {
                  const element = chapter.elements.find(e => e.element === item.element)
                  if (element) {
                    item.requirement = element.requirementText || item.element
                  }
                }
              })
              
              // Update not applicable items
              sectionData.notApplicableItems?.forEach(item => {
                if (!item.requirement || item.requirement === 'Unknown') {
                  const element = chapter.elements.find(e => e.element === item.element)
                  if (element) {
                    item.requirement = element.requirementText || item.element
                  }
                }
              })
            }
          })
        }
        
        setApplicationName(cacheData.applicationName)
        setResults(cacheData.results)
        setActiveTab('results')
      }
    } catch (error) {
      console.error('Error loading cached application:', error)
      alert('Failed to load application')
    }
  }

  const saveRulesToFile = async (rules, year = null) => {
    try {
      // Always save to default location for backward compatibility
      await axios.post(`${BACKEND_URL}/api/save-rules`, { rules })
      
      // Also save to year-specific folder if year is provided
      if (year) {
        const shortYear = year.toString().slice(-2) // "2026" -> "26"
        await axios.post(`${BACKEND_URL}/api/save-rules/${shortYear}`, { rules })
        console.log(`Saved rules to file: ${rules.length} chapters (year: ${year}, folder: ${shortYear})`)
        // Refresh available years list
        await loadAvailableRuleYears()
      } else {
        console.log('Saved rules to file:', rules.length, 'chapters')
      }
    } catch (error) {
      console.error('Error saving rules to file:', error)
      alert('Could not save rules. Make sure the backend server is running (npm run server)')
    }
  }

  // Parse manual review content using OpenAI
  const parseManualReviewWithAI = async (content) => {
    setStatus('🤖 Analyzing manual review with AI...')
    
    try {
      const response = await axios.post(
        `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
        {
          messages: [
            {
              role: 'system',
              content: 'You are an expert at parsing HRSA compliance review documents. Extract structured data from manual review content. For each element found, return: section name (e.g., "Sliding Fee Discount Program", "Key Management Staff"), element letter, element name, compliance status (Yes/No/Not Applicable), and reviewer comments. IMPORTANT: Each element belongs to a specific section - make sure to correctly identify which section each element belongs to. Return as JSON array.'
            },
            {
              role: 'user',
              content: `Parse this manual review content and extract all compliance elements with their section context:\n\n${content.substring(0, 50000)}\n\nReturn JSON array with format: [{"section": "Sliding Fee Discount Program", "letter": "b", "name": "Sliding Fee Discount Program Policies", "status": "Yes", "comments": "Compliance was demonstrated..."}]\n\nMake sure each element includes the correct section name it belongs to.`
            }
          ],
          temperature: 0.1,
          max_tokens: 4000
        },
        {
          headers: {
            'api-key': AZURE_OPENAI_KEY,
            'Content-Type': 'application/json'
          }
        }
      )
      
      const aiResponse = response.data.choices[0].message.content
      // Parse JSON from AI response
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      return []
    } catch (error) {
      console.error('Error parsing manual review with AI:', error)
      return []
    }
  }

  // Export results to Word
  const exportResultsToWord = async () => {
    if (!results) {
      alert('No results available to export')
      return
    }

    try {
      const sections = []

      // Title
      sections.push(
        new Paragraph({
          text: `HRSA Pre-Funding Review Report`,
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        })
      )

      sections.push(
        new Paragraph({
          text: `Application: ${applicationName || 'Unknown'}`,
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        })
      )

      // Summary Statistics
      let totalCompliant = 0
      let totalNonCompliant = 0
      let totalNotApplicable = 0
      
      SECTIONS.forEach(section => {
        const result = results[section]
        if (result) {
          totalCompliant += result.compliantItems?.length || 0
          totalNonCompliant += result.nonCompliantItems?.length || 0
          totalNotApplicable += result.notApplicableItems?.length || 0
        }
      })
      
      const totalItems = totalCompliant + totalNonCompliant + totalNotApplicable

      sections.push(
        new Paragraph({
          text: 'Summary Statistics',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 200 }
        })
      )

      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: `Total Requirements: `, bold: true }),
            new TextRun({ text: `${totalItems}` })
          ],
          spacing: { after: 100 }
        })
      )

      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: `✅ Compliant: `, bold: true }),
            new TextRun({ text: `${totalCompliant}` })
          ],
          spacing: { after: 100 }
        })
      )

      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: `❌ Non-Compliant: `, bold: true }),
            new TextRun({ text: `${totalNonCompliant}` })
          ],
          spacing: { after: 100 }
        })
      )

      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: `⊘ Not Applicable: `, bold: true }),
            new TextRun({ text: `${totalNotApplicable}` })
          ],
          spacing: { after: 400 }
        })
      )

      // Detailed Results by Section
      SECTIONS.forEach(section => {
        const result = results[section]
        if (!result) return

        const allItems = [
          ...(result.compliantItems || []).map(item => ({ ...item, type: 'COMPLIANT' })),
          ...(result.nonCompliantItems || []).map(item => ({ ...item, type: 'NON_COMPLIANT' })),
          ...(result.notApplicableItems || []).map(item => ({ ...item, type: 'NOT_APPLICABLE' }))
        ]

        if (allItems.length === 0) return

        sections.push(
          new Paragraph({
            text: section,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 }
          })
        )

        allItems.forEach((item, idx) => {
          const statusText = item.type === 'COMPLIANT' ? '✅ COMPLIANT' : 
                           item.type === 'NOT_APPLICABLE' ? '⊘ NOT APPLICABLE' : 
                           '❌ NON-COMPLIANT'

          sections.push(
            new Paragraph({
              text: `${item.element}`,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 300, after: 100 }
            })
          )

          sections.push(
            new Paragraph({
              children: [
                new TextRun({ text: `Status: `, bold: true }),
                new TextRun({ text: statusText })
              ],
              spacing: { after: 100 }
            })
          )

          sections.push(
            new Paragraph({
              children: [
                new TextRun({ text: `Requirement: `, bold: true }),
                new TextRun({ text: item.requirement || 'Not specified' })
              ],
              spacing: { after: 100 }
            })
          )

          // Evidence Source & Location
          if (item.evidenceLocation || item.evidenceSection || (item.evidenceReferences && item.evidenceReferences.length > 0)) {
            sections.push(
              new Paragraph({
                children: [
                  new TextRun({ text: `Evidence Source & Location:`, bold: true, color: '2563eb' })
                ],
                spacing: { before: 100, after: 50 }
              })
            )
            
            if (item.evidenceLocation) {
              sections.push(
                new Paragraph({
                  children: [
                    new TextRun({ text: `  📄 Document/Form: `, bold: true }),
                    new TextRun({ text: item.evidenceLocation })
                  ],
                  spacing: { after: 50 }
                })
              )
            }
            
            if (item.evidenceSection && item.evidenceSection !== 'Not found') {
              sections.push(
                new Paragraph({
                  children: [
                    new TextRun({ text: `  📂 Section: `, bold: true }),
                    new TextRun({ text: item.evidenceSection })
                  ],
                  spacing: { after: 50 }
                })
              )
            }
            
            if (item.evidenceReferences && item.evidenceReferences.length > 0) {
              sections.push(
                new Paragraph({
                  children: [
                    new TextRun({ text: `  📌 Page References: `, bold: true }),
                    new TextRun({ text: item.evidenceReferences.join(', ') })
                  ],
                  spacing: { after: 100 }
                })
              )
            }
          }

          sections.push(
            new Paragraph({
              children: [
                new TextRun({ text: `Evidence: `, bold: true }),
                new TextRun({ text: item.evidence || 'No evidence found' })
              ],
              spacing: { after: 100 }
            })
          )

          sections.push(
            new Paragraph({
              children: [
                new TextRun({ text: `Reasoning: `, bold: true }),
                new TextRun({ text: item.reasoning || 'Not specified' })
              ],
              spacing: { after: 200 }
            })
          )
        })
      })

      // Create document
      const doc = new Document({
        sections: [{
          properties: {},
          children: sections
        }]
      })

      // Generate and download
      const blob = await Packer.toBlob(doc)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
      const filename = `Review_Report_${applicationName || 'Report'}_${timestamp}.docx`
      saveAs(blob, filename)

      alert('✅ Word document exported successfully!')
    } catch (error) {
      console.error('Error exporting to Word:', error)
      alert('❌ Failed to export to Word: ' + error.message)
    }
  }

  // Export comparison report to Excel
  const exportComparisonToExcel = () => {
    if (!results || !manualRules) {
      alert('No comparison data available to export')
      return
    }

    const exportData = []
    
    // Add header row
    exportData.push([
      'Section',
      'Element',
      'Agent Analysis - Status',
      'Agent Analysis - Evidence',
      'Agent Analysis - Reasoning',
      'Project Officer Review - Status',
      'Project Officer Review - Comments',
      'Match Status'
    ])

    // Iterate through sections and elements
    SECTIONS.forEach(section => {
      const result = results[section]
      const chapter = manualRules.find(ch => {
        if (ch.section === section) return true
        const chapterName = ch.chapter.split(':')[1]?.trim()
        return chapterName === section
      })

      if (!result || !chapter) return

      chapter.elements.forEach((element, elemIdx) => {
        const validationResult = [...(result.compliantItems || []), ...(result.nonCompliantItems || []), ...(result.notApplicableItems || [])]
          .find(item => {
            if (!item.element || !element.element) return false
            if (item.element === element.element) return true
            const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim()
            return normalizeText(item.element) === normalizeText(element.element)
          })

        if (!validationResult) return

        const isCompliant = result.compliantItems?.some(item => {
          if (!item.element || !element.element) return false
          if (item.element === element.element) return true
          const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim()
          return normalizeText(item.element) === normalizeText(element.element)
        })

        const isNotApplicable = result.notApplicableItems?.some(item => {
          if (!item.element || !element.element) return false
          if (item.element === element.element) return true
          const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim()
          return normalizeText(item.element) === normalizeText(element.element)
        })

        // Get manual review data
        const elementName = element.element || `Element ${elemIdx + 1}`
        const elementMatch = elementName.match(/Element\s+([a-z])/i)
        const elementLetter = elementMatch?.[1]?.toLowerCase()

        let manualStatus = 'Not Found'
        let manualComments = 'Element not found in manual review'
        let matchStatus = 'No Match'

        if (elementLetter && manualReviewParsed && manualReviewParsed.length > 0) {
          const parsedElement = manualReviewParsed.find(item => {
            const letterMatches = item.letter?.toLowerCase() === elementLetter
            const itemSection = item.section?.toLowerCase() || ''
            const currentSection = section.toLowerCase()
            
            if (letterMatches && itemSection.includes(currentSection)) return true
            
            if (letterMatches) {
              const sectionWords = currentSection.split(/\s+/)
              return sectionWords.some(word => word.length > 3 && itemSection.includes(word))
            }
            
            return false
          })

          if (parsedElement) {
            const status = parsedElement.status?.toLowerCase()
            if (status?.includes('yes')) {
              manualStatus = 'COMPLIANT (Yes)'
            } else if (status?.includes('not applicable') || status?.includes('n/a')) {
              manualStatus = 'NOT APPLICABLE'
            } else if (status?.includes('no')) {
              manualStatus = 'NON-COMPLIANT (No)'
            }
            manualComments = parsedElement.comments || ''

            // Determine match status
            const aiStatus = isNotApplicable ? 'NOT_APPLICABLE' : (isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT')
            const manualIsCompliant = status?.includes('yes')
            const manualIsNotApplicable = status?.includes('not applicable') || status?.includes('n/a')
            
            if (aiStatus === 'NOT_APPLICABLE' && manualIsNotApplicable) {
              matchStatus = '✓ Match'
            } else if (aiStatus === 'COMPLIANT' && manualIsCompliant) {
              matchStatus = '✓ Match'
            } else if (aiStatus === 'NON_COMPLIANT' && !manualIsCompliant && !manualIsNotApplicable) {
              matchStatus = '✓ Match'
            } else {
              matchStatus = '✗ Mismatch'
            }
          }
        }

        // Add row to export data
        const aiStatusText = isNotApplicable ? 'NOT APPLICABLE' : (isCompliant ? 'COMPLIANT' : 'NON-COMPLIANT')
        exportData.push([
          section,
          elementName,
          aiStatusText,
          validationResult.evidence || '',
          validationResult.reasoning || '',
          manualStatus,
          manualComments,
          matchStatus
        ])
      })
    })

    // Create worksheet and workbook
    const ws = XLSX.utils.aoa_to_sheet(exportData)
    
    // Set column widths
    ws['!cols'] = [
      { wch: 30 }, // Section
      { wch: 50 }, // Element
      { wch: 20 }, // AI Status
      { wch: 60 }, // AI Evidence
      { wch: 60 }, // AI Reasoning
      { wch: 25 }, // Manual Status
      { wch: 60 }, // Manual Comments
      { wch: 15 }  // Match Status
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Comparison Report')

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
    const filename = `Compliance_Comparison_${applicationName || 'Report'}_${timestamp}.xlsx`

    // Download file
    XLSX.writeFile(wb, filename)
  }

  // Handle manual review PDF upload
  const handleManualReviewUpload = async () => {
    if (!manualReviewFile) return
    
    setProcessing(true)
    setStatus('Extracting text from manual review PDF...')
    
    try {
      const content = await extractTextFromPDF(manualReviewFile)
      setManualReviewContent(content)
      
      // Check if manual review cache exists
      setStatus('🔍 Checking cache...')
      const cacheCheckResponse = await axios.post(`${BACKEND_URL}/api/manual-review/check-cache`, {
        filename: manualReviewFile.name
      })
      
      let parsedElements = []
      
      if (cacheCheckResponse.data.exists) {
        // Load from cache
        setStatus('📦 Loading from cache...')
        console.log('✅ Manual review cache found, loading...')
        
        const cacheLoadResponse = await axios.post(`${BACKEND_URL}/api/manual-review/load-cache`, {
          cacheKey: cacheCheckResponse.data.cacheKey
        })
        
        parsedElements = cacheLoadResponse.data.data
        console.log('✅ Loaded manual review from cache:', parsedElements.length, 'elements')
        setStatus('✅ Manual review loaded from cache!')
      } else {
        // No cache, parse with AI
        console.log('❌ No cache found, parsing with AI...')
        
        // Save manual review content to local file for analysis
        try {
          await axios.post(`${BACKEND_URL}/api/save-manual-review`, {
            content: content,
            filename: manualReviewFile.name
          })
          console.log('✅ Manual review content saved to local file for analysis')
        } catch (saveError) {
          console.warn('Could not save manual review to file:', saveError.message)
        }
        
        // Parse manual review with AI to extract structured data
        parsedElements = await parseManualReviewWithAI(content)
        console.log('🤖 AI parsed elements:', parsedElements)
        
        // Save to cache
        try {
          await axios.post(`${BACKEND_URL}/api/manual-review/save-cache`, {
            filename: manualReviewFile.name,
            parsedElements: parsedElements
          })
          console.log('✅ Manual review cache saved')
        } catch (cacheError) {
          console.warn('Could not save manual review cache:', cacheError.message)
        }
        
        setStatus('✅ Manual review loaded and analyzed successfully!')
      }
      
      // Store parsed elements for comparison
      setManualReviewParsed(parsedElements)
      setShowComparison(true)
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`)
    } finally {
      setProcessing(false)
    }
  }

  // Azure Document Intelligence - Extract text from PDF with page numbers
  const extractTextFromPDF = async (file) => {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await axios.post(
        `${AZURE_DOC_ENDPOINT}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`,
        formData,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': AZURE_DOC_KEY,
            'Content-Type': 'multipart/form-data'
          }
        }
      )

      // Poll for results
      const operationLocation = response.headers['operation-location']
      let result = null
      
      while (!result || result.status === 'running') {
        await new Promise(resolve => setTimeout(resolve, 2000))
        const pollResponse = await axios.get(operationLocation, {
          headers: { 'Ocp-Apim-Subscription-Key': AZURE_DOC_KEY }
        })
        result = pollResponse.data
      }

      // Extract content with ACCURATE page numbers matching the PDF footer
      const pages = result.analyzeResult.pages || []
      const paragraphs = result.analyzeResult.paragraphs || []
      const tables = result.analyzeResult.tables || []
      
      let contentWithPages = ''
      
      // Step 1: Extract footer page numbers from each page
      const footerPageMap = {} // Maps Azure page number to footer page number
      
      pages.forEach((page, index) => {
        const azurePageNum = page.pageNumber || (index + 1)
        const lines = page.lines || []
        
        // Look for footer with "Page Number: XX" or "Page Number:XX"
        lines.forEach(line => {
          const pageMatch = line.content.match(/Page Number:\s*(\d+)/i)
          if (pageMatch) {
            footerPageMap[azurePageNum] = pageMatch[1]
          }
        })
        
        // If no footer found, use Azure page number as fallback
        if (!footerPageMap[azurePageNum]) {
          footerPageMap[azurePageNum] = azurePageNum.toString()
        }
      })
      
      // Method 1: Use paragraphs which preserve page numbers accurately
      if (paragraphs && paragraphs.length > 0) {
        // Group paragraphs by FOOTER page number
        const pageContent = {}
        
        paragraphs.forEach(para => {
          const azurePageNum = para.boundingRegions?.[0]?.pageNumber || 1
          const footerPageNum = footerPageMap[azurePageNum] || azurePageNum
          
          if (!pageContent[footerPageNum]) {
            pageContent[footerPageNum] = []
          }
          
          // Skip footer lines themselves
          if (para.content.match(/Page Number:\s*\d+/i) || para.content.match(/Tracking Number/i)) {
            return
          }
          
          // Determine content type
          let contentType = '[TEXT]'
          if (para.role === 'title' || para.role === 'sectionHeading') {
            contentType = '[HEADING]'
          }
          
          pageContent[footerPageNum].push({
            type: contentType,
            content: para.content
          })
        })
        
        // Add tables to their respective pages using footer page numbers
        tables.forEach((table, tableIndex) => {
          const azurePageNum = table.boundingRegions?.[0]?.pageNumber || 1
          const footerPageNum = footerPageMap[azurePageNum] || azurePageNum
          
          if (!pageContent[footerPageNum]) {
            pageContent[footerPageNum] = []
          }
          
          // Extract table content
          const rows = table.cells || []
          const tableData = {}
          rows.forEach(cell => {
            const rowIdx = cell.rowIndex || 0
            const colIdx = cell.columnIndex || 0
            if (!tableData[rowIdx]) tableData[rowIdx] = []
            tableData[rowIdx][colIdx] = cell.content || ''
          })
          
          let tableText = `Table ${tableIndex + 1}:\n`
          Object.keys(tableData).forEach(rowIdx => {
            tableText += tableData[rowIdx].join(' | ') + '\n'
          })
          
          pageContent[footerPageNum].push({
            type: '[TABLE]',
            content: tableText
          })
        })
        
        // Build content page by page in order (sorted by footer page number)
        const sortedPages = Object.keys(pageContent).sort((a, b) => parseInt(a) - parseInt(b))
        sortedPages.forEach(pageNum => {
          contentWithPages += `\n\n========== PAGE ${pageNum} (from PDF footer) ==========\n\n`
          pageContent[pageNum].forEach(item => {
            contentWithPages += `${item.type} ${item.content}\n\n`
          })
        })
      } else {
        // Fallback: Use pages with lines
        pages.forEach((page, index) => {
          const pageNumber = page.pageNumber || (index + 1)
          contentWithPages += `\n\n========== PAGE ${pageNumber} ==========\n\n`
          
          const lines = page.lines || []
          lines.forEach(line => {
            contentWithPages += `[TEXT] ${line.content}\n`
          })
        })
        
        // Add tables
        tables.forEach((table, tableIndex) => {
          const tablePageNumber = table.boundingRegions?.[0]?.pageNumber || 'Unknown'
          contentWithPages += `\n\n[TABLE on PAGE ${tablePageNumber}]:\n`
          
          const rows = table.cells || []
          const tableData = {}
          rows.forEach(cell => {
            const rowIdx = cell.rowIndex || 0
            const colIdx = cell.columnIndex || 0
            if (!tableData[rowIdx]) tableData[rowIdx] = []
            tableData[rowIdx][colIdx] = cell.content || ''
          })
          
          Object.keys(tableData).forEach(rowIdx => {
            contentWithPages += tableData[rowIdx].join(' | ') + '\n'
          })
        })
      }
      
      // Final fallback
      if (!contentWithPages.trim()) {
        contentWithPages = result.analyzeResult.content
      }

      return contentWithPages
    } catch (error) {
      console.error('Azure extraction error:', error)
      throw new Error('Failed to extract text from PDF')
    }
  }

  // Azure OpenAI - Extract compliance rules from manual
  const extractComplianceRules = async (content) => {
    const prompt = `You are analyzing the HRSA SAC and RD PAR Guiding Principles document. This document contains compliance requirements for Health Center Programs.

IMPORTANT: Look for sections starting with "Chapter" followed by a number and title. Each chapter contains:
- Authority: Legal citations (e.g., "Section 330(k)(2) and Section 330(k)(3)(J) of the PHS Act")
- Element: Starts with "Element" followed by a letter (e.g., "Element b - Update of Needs Assessment")
- Requirement description with bullet points
- "Section of the Application to review" 
- "Items 2a - c within the Application" (or similar)

Extract ALL compliance requirements from these chapters:

- Chapter 9: Sliding Fee Discount Program
- Chapter 11: Key Management Staff
- Chapter 12: Contracts and Subawards
- Chapter 14: Collaborative Relationships
- Chapter 16: Billing and Collections
- Chapter 17: Budget
- Chapter 19: Board Authority
- Chapter 20: Board Composition

For EACH Element, extract the following structure:

EXAMPLE from the document:
"Chapter 9: Sliding Fee Discount Program
Authority: Section 330(k)(3)(G) of the PHS Act; and 42 CFR 51c.303(f)...
Element a - Sliding Fee Discount Program
The health center has a sliding fee discount program...
Section of the Application to review Project Narrative - Services section
Items within the Application
Describe your sliding fee discount program...
NOTE: Review the sliding fee schedule and policies."

Extract into this JSON structure (ONE object per chapter with ALL elements grouped inside):
{
  "requirements": [
    {
      "chapter": "Chapter 9: Sliding Fee Discount Program",
      "section": "Sliding Fee Discount Program",
      "authority": "Full authority text from the document",
      "elements": [
        {
          "element": "Element a - Sliding Fee Discount Program",
          "requirementText": "Main requirement paragraph",
          "requirementDetails": ["First bullet point", "Second bullet point", "Third bullet point"],
          "applicationSection": "Project Narrative - Need section, items 2a - c",
          "applicationItems": ["a) Item text", "b) Item text", "c) Item text"],
          "footnotes": "Any footnote text with numbers like 13, 14, OR any NOTE text that appears after the Application Section"
        }
      ]
    }
  ]
}

CRITICAL: Return exactly 8 objects in the requirements array - one for each chapter. Group ALL elements found in each chapter together.

CRITICAL: 
- Look for text that starts with "Chapter 3:", "Chapter 9:", etc.
- Extract the "Authority:" line that follows
- Extract each "Element" (Element a, Element b, etc.)
- Extract bullet points marked with :unselected: or bullet symbols
- Extract "Section of the Application to review"
- Extract "Items" with letters a), b), c)
- IMPORTANT: Extract any "NOTE:" text that appears after the Application Section - this is critical guidance
- Include any numbered footnotes (13, 14, etc.)

IMPORTANT: Search through the ENTIRE document below. All chapters may be spread throughout the document. Make sure to extract ALL chapters listed above.

Document content:
${content}`

    try {
      const response = await axios.post(
        `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
        {
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.1
        },
        {
          headers: {
            'api-key': AZURE_OPENAI_KEY,
            'Content-Type': 'application/json'
          }
        }
      )

      const content = response.data.choices[0].message.content
      console.log('AI Response:', content)
      
      const result = JSON.parse(content)
      console.log('Parsed result:', result)
      
      const requirements = result.requirements || []
      console.log(`Extracted ${requirements.length} requirements`)
      
      return requirements
    } catch (error) {
      console.error('OpenAI extraction error:', error)
      console.error('Error details:', error.response?.data || error.message)
      throw new Error('Failed to extract compliance rules: ' + error.message)
    }
  }

  // Helper function to retry API calls with exponential backoff
  const retryWithBackoff = async (fn, sectionName, maxRetries = 3) => {
    let lastError = null
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`🔄 Attempting ${sectionName} (attempt ${attempt + 1}/${maxRetries})`)
        const result = await fn()
        return result
      } catch (error) {
        lastError = error
        const is429Error = error.response?.status === 429
        
        if (attempt < maxRetries - 1) {
          if (is429Error) {
            const delay = 30000 * (attempt + 1) // 30s, 60s, 90s
            console.log(`⚠️ Rate limit (429) on ${sectionName}. Waiting ${delay/1000}s... (Attempt ${attempt + 1}/${maxRetries})`)
            setStatus(`⚠️ Rate limit. Waiting ${delay/1000}s before retry ${attempt + 2}/${maxRetries}...`)
            await new Promise(resolve => setTimeout(resolve, delay))
            console.log(`✅ Wait complete. Retrying ${sectionName} now...`)
          } else {
            console.log(`❌ Error on ${sectionName}: ${error.message}. Retrying in 5s...`)
            await new Promise(resolve => setTimeout(resolve, 5000))
          }
        } else {
          console.log(`❌ Max retries (${maxRetries}) reached for ${sectionName}. Giving up.`)
        }
      }
    }
    
    // If we get here, all retries failed
    throw lastError
  }

  // Azure OpenAI - Validate ALL sections in ONE API call (MAXIMUM OPTIMIZATION)
  const validateComplianceAll = async (rules, applicationContent, progressCallback) => {
    try {
      // Build prompt with ALL chapters and ALL elements
      const allChaptersPrompt = []
      
      for (let sectionIndex = 0; sectionIndex < SECTIONS.length; sectionIndex++) {
        const section = SECTIONS[sectionIndex]
        
        if (progressCallback) {
          progressCallback(`📋 Preparing ${section} (${sectionIndex + 1}/${SECTIONS.length})...`, true)
        }
        
        const chapter = rules.find(r => {
          if (r.section === section) return true
          if (section.includes(r.section) || r.section.includes(section)) return true
          return false
        })
        
        if (!chapter || !chapter.elements) {
          allChaptersPrompt.push(`\n[SECTION ${sectionIndex + 1}: ${section} - NO RULES FOUND]\n`)
          continue
        }

        const elementsPrompt = chapter.elements.map((element, elemIndex) => `
REQUIREMENT #${sectionIndex + 1}.${elemIndex + 1}
SECTION: ${section}
ELEMENT: ${element.element || 'Compliance Requirement'}
REQUIREMENT: ${element.requirementText}
${element.requirementDetails && element.requirementDetails.length > 0 ? `MUST ADDRESS: ${element.requirementDetails.join('; ')}` : ''}
${element.footnotes ? `NOTES: ${element.footnotes}` : ''}
`).join('\n')

        allChaptersPrompt.push(`
═══════════════════════════════════════════════════════════════
SECTION ${sectionIndex + 1}: ${section}
═══════════════════════════════════════════════════════════════
CHAPTER: ${chapter.chapter || chapter.section}
AUTHORITY: ${chapter.authority || 'N/A'}
ELEMENTS TO VALIDATE: ${chapter.elements.length}

${elementsPrompt}
`)
      }
      
      const allChaptersPromptText = allChaptersPrompt.join('\n')

      const totalRequirements = SECTIONS.reduce((sum, section) => {
        const chapter = rules.find(r => r.section === section || section.includes(r.section) || r.section.includes(section))
        return sum + (chapter?.elements?.length || 0)
      }, 0)

      const prompt = `You are validating HRSA compliance for a health center application.

You will validate ${totalRequirements} requirements across ${SECTIONS.length} sections in ONE analysis.

${allChaptersPromptText}

═══════════════════════════════════════════════════════════════
VALIDATION INSTRUCTIONS
═══════════════════════════════════════════════════════════════

⚠️ CRITICAL - NO HALLUCINATION:
- ONLY use information EXPLICITLY in the application
- NEVER assume, infer, or guess
- If no explicit evidence found, mark NON_COMPLIANT
- Same application = same result

VALIDATION STEPS:
1. For EACH requirement, search ENTIRE application
2. Check N/A conditions FIRST (only if NOTE says "Select 'N/A' if...")
3. Find direct quotes proving compliance
4. Validate ALL "Must Address" items
5. Document findings concisely

STATUS RULES:
- COMPLIANT: Clear explicit proof found
- NON_COMPLIANT: No evidence or incomplete
- NOT_APPLICABLE: Only if NOTE says "N/A if..." AND condition met

EVIDENCE:
- Quote 1-3 KEY sentences in "quotation marks"
- Include page numbers
- 3-4 sentence reasoning

APPLICATION CONTENT:
${applicationContent}

═══════════════════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════════════════

Return JSON with validations array containing ${totalRequirements} results:

{
  "validations": [
    {
      "section": "Section name",
      "requirementNumber": "1.1",
      "element": "Element name",
      "status": "COMPLIANT|NON_COMPLIANT|NOT_APPLICABLE",
      "evidence": "Direct quotes or 'Not found'",
      "evidenceLocation": "Page X or 'Not found'",
      "evidenceSection": "REQUIRED: Specific document/attachment/section name where evidence was found (e.g., 'Attachment D: Sliding Fee Schedule', 'Project Narrative - Section 3', 'Form 5A'). Use 'Not found' only if no evidence exists.",
      "reasoning": "3-4 sentences"
    }
    // ... ${totalRequirements} total validations
  ]
}

CRITICAL: Return exactly ${totalRequirements} validation objects.`

      if (progressCallback) {
        progressCallback(`🤖 Sending to AI for analysis (this may take 30-60 seconds)...`, true)
      }
      
      const response = await axios.post(
        `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
        {
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 16000
        },
        {
          headers: {
            'api-key': AZURE_OPENAI_KEY,
            'Content-Type': 'application/json'
          }
        }
      )

      if (progressCallback) {
        progressCallback(`✅ AI analysis complete! Parsing results...`, true)
      }
      
      const content = response.data.choices[0].message.content
      const result = JSON.parse(content)
      
      // Organize results by section
      const sectionResults = {}
      SECTIONS.forEach(section => {
        sectionResults[section] = { compliantItems: [], nonCompliantItems: [], notApplicableItems: [] }
      })

      if (result.validations && Array.isArray(result.validations)) {
        result.validations.forEach(validation => {
          const section = validation.section || 'Unknown'
          
          if (!sectionResults[section]) {
            sectionResults[section] = { compliantItems: [], nonCompliantItems: [], notApplicableItems: [] }
          }

          // Find the original element to get the requirementText
          const chapter = rules.find(r => r.section === section || section.includes(r.section) || r.section.includes(section))
          const element = chapter?.elements?.find(e => e.element === validation.element)

          const item = {
            element: validation.element || 'Unknown',
            requirement: element?.requirementText || validation.element || 'Not specified',
            status: validation.status,
            whatWasChecked: validation.whatWasChecked || 'Not specified',
            evidence: validation.evidence || 'Not found',
            evidenceLocation: validation.evidenceLocation || 'Not found',
            evidenceSection: validation.evidenceSection || 'Not found',
            reasoning: validation.reasoning || 'No reasoning provided',
            sectionsReferenced: 'Not specified',
            contentTypes: 'Not specified'
          }

          if (validation.status === 'COMPLIANT') {
            sectionResults[section].compliantItems.push(item)
          } else if (validation.status === 'NOT_APPLICABLE') {
            sectionResults[section].notApplicableItems.push(item)
          } else {
            sectionResults[section].nonCompliantItems.push(item)
          }
        })
      }

      return sectionResults
    } catch (error) {
      console.error('Single-call validation error:', error)
      throw error
    }
  }

  // Azure OpenAI - Validate compliance (OPTIMIZED - Batch validation per section)
  const validateComplianceBatch = async (section, rules, applicationContent) => {
    // Find the chapter that matches this section
    const chapter = rules.find(r => {
      if (r.section === section) return true
      if (section.includes(r.section) || r.section.includes(section)) return true
      return false
    })
    
    if (!chapter || !chapter.elements) {
      return { compliantItems: [], nonCompliantItems: [], notApplicableItems: [] }
    }

    // Build a single prompt with ALL elements for this chapter
    const elementsPrompt = chapter.elements.map((element, index) => `
═══════════════════════════════════════════════════════════════
REQUIREMENT #${index + 1}
═══════════════════════════════════════════════════════════════

ELEMENT: ${element.element || 'Compliance Requirement'}

REQUIREMENT TO VALIDATE:
${element.requirementText}

${element.requirementDetails && element.requirementDetails.length > 0 ? `
SPECIFIC ITEMS THAT MUST BE ADDRESSED:
${element.requirementDetails.map((detail, i) => `${i + 1}. ${detail}`).join('\n')}
` : ''}

${element.applicationSection ? `
APPLICATION SECTION TO REVIEW (HINT ONLY):
${element.applicationSection}
` : ''}

${element.applicationItems && element.applicationItems.length > 0 ? `
SPECIFIC ITEMS TO CHECK:
${element.applicationItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}
` : ''}

${element.footnotes ? `
IMPORTANT NOTES AND GUIDANCE:
${element.footnotes}
` : ''}
`).join('\n')

    const prompt = `You are validating HRSA compliance requirements for a health center application.

CHAPTER: ${chapter.chapter || chapter.section}
AUTHORITY: ${chapter.authority || 'N/A'}

You will validate ${chapter.elements.length} requirements below. For EACH requirement, you must search the application content and return a validation result.

${elementsPrompt}

═══════════════════════════════════════════════════════════════
VALIDATION INSTRUCTIONS
═══════════════════════════════════════════════════════════════

⚠️ CRITICAL - NO HALLUCINATION:
- ONLY use information EXPLICITLY written in the application
- NEVER make up, assume, infer, or guess information
- If you cannot find explicit evidence, mark as NON_COMPLIANT
- Same application must always produce same result

VALIDATION STEPS:
1. For EACH requirement above, search the ENTIRE application systematically
2. Check for N/A conditions FIRST (only if explicit NOTE says "Select 'N/A' if...")
3. Find direct quotes that prove compliance
4. Validate ALL "Must Address" items if listed
5. Document findings concisely

STATUS RULES:
- COMPLIANT: Clear, explicit proof found that fully satisfies requirement
- NON_COMPLIANT: No evidence found, or evidence is incomplete/unclear
- NOT_APPLICABLE: Only if explicit NOTE says "N/A if..." AND condition is met
- CANNOT_BE_DETERMINED: Application content insufficient to decide

EVIDENCE REQUIREMENTS:
- Quote 1-3 KEY sentences maximum in "quotation marks"
- Include exact page numbers
- Keep reasoning to 3-4 sentences
- Be concise and focused

APPLICATION CONTENT:
${applicationContent}

═══════════════════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════════════════

Return JSON with an array of ${chapter.elements.length} validation results (one per requirement):

{
  "validations": [
    {
      "requirementNumber": 1,
      "element": "Element name from requirement",
      "status": "COMPLIANT" or "NON_COMPLIANT" or "NOT_APPLICABLE" or "CANNOT_BE_DETERMINED",
      "whatWasChecked": "Brief statement (1-2 sentences)",
      "evidence": "Direct quotes in 'quotation marks' or 'Not found'",
      "evidenceLocation": "Page number (e.g., 'Page 93') or 'Not found'",
      "reasoning": "Concise 3-4 sentence explanation"
    }
    // ... repeat for all ${chapter.elements.length} requirements
  ]
}

CRITICAL: Return exactly ${chapter.elements.length} validation objects in the array, one for each requirement listed above.`

    try {
      const response = await axios.post(
        `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
        {
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 16000  // Increased for batch processing
        },
        {
          headers: {
            'api-key': AZURE_OPENAI_KEY,
            'Content-Type': 'application/json'
          }
        }
      )

      const content = response.data.choices[0].message.content
      const result = JSON.parse(content)
      
      const compliantItems = []
      const nonCompliantItems = []
      const notApplicableItems = []

      // Process all validations from the batch response
      if (result.validations && Array.isArray(result.validations)) {
        result.validations.forEach((validation, index) => {
          const element = chapter.elements[index]
          
          const item = {
            element: element?.element || validation.element || 'Unknown',
            requirement: element?.requirementText || 'Unknown',
            status: validation.status,
            whatWasChecked: validation.whatWasChecked || 'Not specified',
            evidence: validation.evidence || 'Not found',
            evidenceLocation: validation.evidenceLocation || 'Not found',
            reasoning: validation.reasoning || 'No reasoning provided',
            sectionsReferenced: 'Not specified',
            contentTypes: 'Not specified'
          }

          if (validation.status === 'COMPLIANT') {
            compliantItems.push(item)
          } else if (validation.status === 'NOT_APPLICABLE') {
            notApplicableItems.push(item)
          } else {
            nonCompliantItems.push(item)
          }
        })
      }

      return { compliantItems, nonCompliantItems, notApplicableItems }
    } catch (error) {
      console.error('Batch validation error:', error)
      throw error
    }
  }

  // Azure OpenAI - Validate compliance (OLD METHOD - kept for fallback)
  const validateCompliance = async (section, rules, applicationContent) => {
    // Find the chapter that matches this section
    const chapter = rules.find(r => {
      if (r.section === section) return true
      if (section.includes(r.section) || r.section.includes(section)) return true
      return false
    })
    
    if (!chapter || !chapter.elements) {
      return { compliantItems: [], nonCompliantItems: [], notApplicableItems: [] }
    }
    
    const compliantItems = []
    const nonCompliantItems = []
    const notApplicableItems = []

    // Validate each element within the chapter
    for (const element of chapter.elements) {
      const prompt = `VALIDATE HRSA COMPLIANCE REQUIREMENT:

CHAPTER: ${chapter.chapter || chapter.section}
AUTHORITY: ${chapter.authority || 'N/A'}
ELEMENT: ${element.element || 'Compliance Requirement'}

REQUIREMENT TO VALIDATE:
${element.requirementText}

${element.requirementDetails && element.requirementDetails.length > 0 ? `
SPECIFIC ITEMS THAT MUST BE ADDRESSED:
${element.requirementDetails.map((detail, i) => `${i + 1}. ${detail}`).join('\n')}
` : ''}

${element.applicationSection ? `
APPLICATION SECTION TO REVIEW:
${element.applicationSection}
NOTE: This is a HINT for where to look, but you should search the ENTIRE application document for evidence.
` : ''}

${element.applicationItems && element.applicationItems.length > 0 ? `
SPECIFIC ITEMS TO CHECK IN APPLICATION:
${element.applicationItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}
` : ''}

${element.footnotes ? `
IMPORTANT NOTES AND GUIDANCE:
${element.footnotes}
` : ''}

CRITICAL VALIDATION INSTRUCTIONS:

⚠️ CRITICAL INSTRUCTION - NO HALLUCINATION:
- You MUST ONLY use information that is EXPLICITLY written in the application content provided below
- NEVER make up, assume, infer, or guess any information
- NEVER use external knowledge or general assumptions about health centers
- If you cannot find explicit evidence in the application text, you MUST mark it as NON_COMPLIANT
- Your response must be 100% based on the actual application content - nothing else
- Consistency is critical: the same application must always produce the same result

STEP 1 - UNDERSTAND THE REQUIREMENT:
- Read the requirement carefully
- Identify what specific evidence, policies, data, or documentation is needed
- Understand what would constitute clear proof of compliance

STEP 2 - SEARCH THE ENTIRE APPLICATION:
- Do NOT rely on section names, page numbers, or attachment hints from the compliance manual
- Those are only suggestions for humans - ignore them
- Search through ALL content below systematically
- Look for ANY text, dates, numbers, tables, policies, or attachments that prove the requirement
- Evidence can appear ANYWHERE in the document - check all pages

STEP 3 - EVALUATE EVIDENCE STRICTLY (ZERO TOLERANCE FOR HALLUCINATION):

🚨 FIRST PRIORITY - CHECK FOR N/A CONDITIONS (STRICT RULES):
- BEFORE evaluating compliance, read the "IMPORTANT NOTES AND GUIDANCE" section above
- ⚠️ CRITICAL: You can ONLY mark as NOT_APPLICABLE if BOTH conditions are met:
  1. The "IMPORTANT NOTES AND GUIDANCE" section contains EXPLICIT text like "Select 'N/A' if..." or "NOTE: Select 'N/A' if..." or "Not Applicable" for THIS SPECIFIC ELEMENT
  2. The N/A condition described in that NOTE is actually met in the application
- ⚠️ FORBIDDEN: Do NOT mark as NOT_APPLICABLE based on your own reasoning, logic, or interpretation
- ⚠️ FORBIDDEN: Do NOT mark as NOT_APPLICABLE just because the organization has a waiver, special circumstance, or alternative approach
- ⚠️ FORBIDDEN: Do NOT mark as NOT_APPLICABLE if the NOTE is for a DIFFERENT element in the same chapter
- Example of VALID N/A: 
  * NOTE says "Select 'N/A' if Form 8 indicates no subawards" → Check Form 8 for Q2 answer
  * If Form 8 shows Q2='NO' or '0' contracts/subawards → N/A condition is MET
  * ONLY THEN return status: "NOT_APPLICABLE" with reasoning: "Not Applicable - Form 8 Q2 shows 'NO' which meets the N/A condition stated in the NOTE"
- Example of INVALID N/A:
  * Organization has a governance waiver BUT the element has no NOTE about N/A for waivers → Mark as NON_COMPLIANT if requirements not met
  * You think the requirement doesn't apply BUT there's no explicit NOTE → Mark as NON_COMPLIANT if requirements not met
- IF NO EXPLICIT N/A NOTE EXISTS FOR THIS ELEMENT: You MUST evaluate for compliance/non-compliance - NOT_APPLICABLE is not an option

AFTER checking N/A conditions, evaluate compliance:
- Only mark COMPLIANT if you find CLEAR, EXPLICIT proof that fully satisfies the requirement (NOT for N/A cases)
- If evidence is unclear, partial, ambiguous, or incomplete, mark NON_COMPLIANT
- If no evidence is found and N/A doesn't apply, mark NON_COMPLIANT and state it is missing
- If the application content is insufficient to make a determination, mark CANNOT_BE_DETERMINED
- ABSOLUTELY FORBIDDEN: Do NOT guess, assume, infer, or make up any information
- ABSOLUTELY FORBIDDEN: Do NOT use general knowledge about what health centers "typically" do
- ABSOLUTELY FORBIDDEN: Do NOT mark compliant without direct, explicit proof from the application text OR valid N/A conditions
- REQUIRED: Every piece of evidence must be a direct quote from the application with exact page number
- REQUIRED: If you cannot provide a direct quote and page number, mark as NON_COMPLIANT or CANNOT_BE_DETERMINED

STEP 4 - VALIDATE EACH "MUST ADDRESS" ITEM:
${element.requirementDetails && element.requirementDetails.length > 0 ? `
- For EACH of the ${element.requirementDetails.length} "Must Address" items listed above, you MUST:
  * Search for specific evidence that addresses that particular item
  * Provide a direct quote (1-2 sentences) proving it was addressed
  * Mark it as "found" or "not found"
- The overall compliance status should be COMPLIANT only if ALL Must Address items have evidence
- If even ONE Must Address item lacks evidence, mark as NON_COMPLIANT
` : ''}

STEP 5 - DOCUMENT YOUR FINDINGS (BE CONCISE):

CRITICAL - EVIDENCE REQUIREMENTS:
- Only include the MOST RELEVANT evidence that directly proves compliance
- Quote 1-3 KEY sentences maximum - not entire paragraphs
- If multiple pieces of evidence exist, choose the STRONGEST and CLEAREST one
- Do NOT list 5-10 bullet points - be selective and focused
- MANDATORY: You MUST wrap all direct quotes from the application in "double quotation marks" like this: "exact text from application"
- Example: The application states "The health center conducts a CHNA every three years" which proves compliance.
- WITHOUT quotation marks, the evidence cannot be highlighted for the user
- CRITICAL: Every quote must be VERBATIM from the application - do not paraphrase or summarize
- CRITICAL: If you cannot find a direct quote to support compliance, you MUST mark as NON_COMPLIANT
- VERIFICATION: Include exact page numbers so users can verify your quotes are real and not hallucinated
- IMPORTANT: When you find evidence, also note the section heading or context from the PDF where it was found
- Look for section titles, headings, or document structure markers near the evidence
- CRITICAL: For each piece of evidence, provide a reference citation showing WHERE in the application this information appears
- References should include: section name, page number, and brief context (e.g., "Page 45, Section 3.2: Community Health Needs Assessment - Table showing CHNA timeline")
- Multiple references can be provided if evidence comes from different parts of the document

CRITICAL - REASONING REQUIREMENTS:
- Keep reasoning to 3-4 sentences maximum
- Be precise and to the point
- MUST explicitly state: 
  * What was required (the main requirement)
  * What items were checked (reference the "Items to Check" listed in whatWasChecked)
  * Whether EACH item was satisfied or not satisfied with brief explanation
  * Final conclusion on overall compliance
- Example: "The requirement mandates a triennial needs assessment using current data. We checked: (1) frequency of assessment - SATISFIED: application states CHNA every three years, (2) use of current data - SATISFIED: multiple current data sources documented. All items satisfied, requirement is compliant."
- No long paragraphs or excessive detail

APPLICATION CONTENT (Full document with page numbers and content types):
${applicationContent}

⚠️ CRITICAL STATUS SELECTION RULES:
- If your reasoning contains "not applicable" or "N/A condition is met" or "requirement does not apply" → status MUST be "NOT_APPLICABLE"
- If you found clear evidence that satisfies the requirement → status MUST be "COMPLIANT"
- If you did not find evidence or evidence is insufficient → status MUST be "NON_COMPLIANT"
- NEVER use "NON_COMPLIANT" when your reasoning says "not applicable"

Return JSON: {
  "status": "COMPLIANT" or "NON_COMPLIANT" or "NOT_APPLICABLE" or "CANNOT_BE_DETERMINED",
  "whatWasChecked": "Brief statement of what requirement was validated (1-2 sentences max)",
  "evidence": "1-3 KEY direct quotes in 'quotation marks' that prove compliance, or 'Not found'. Keep it concise - only the most relevant evidence.",
  "evidenceLocation": "Page number only (e.g., 'Page 93' or 'Not found')",
  "evidenceSection": "REQUIRED: The specific document name, attachment, or section heading where evidence was found. Examples: 'Attachment D: Sliding Fee Discount Schedule', 'Project Narrative - Section 3', 'Form 5A: Service Sites', 'Budget Narrative', etc. If evidence is found, you MUST specify which document/attachment/section it came from. Use 'Not found' only if no evidence exists.",
  "evidenceReferences": ["Array of specific references showing where evidence was found. Format: 'Page X, Section Y: Brief context'. Example: ['Page 45, Section 3.2: CHNA Timeline Table', 'Page 47, Appendix A: Data Sources List']. Use empty array [] if not found."],
  "reasoning": "Concise 3-4 sentence explanation following the format specified above.",
  "mustAddressValidation": ${element.requirementDetails && element.requirementDetails.length > 0 ? `[
    {
      "item": "The exact Must Address item text",
      "status": "found" or "not_found",
      "evidence": "Direct quote proving this specific item was addressed, or 'Not found'",
      "page": "Page number or 'Not found'"
    }
    // Include one object for EACH Must Address item
  ]` : '[]'},
  "sectionsReferenced": "NOT USED - leave empty",
  "contentTypes": "NOT USED - leave empty"
}`

      try {
        const response = await axios.post(
          `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
          {
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.1
          },
          {
            headers: {
              'api-key': AZURE_OPENAI_KEY,
              'Content-Type': 'application/json'
            }
          }
        )

        const content = response.data.choices[0].message.content
        const result = JSON.parse(content)
        
        if (result.status === 'COMPLIANT') {
          compliantItems.push({
            element: element.element,
            requirement: element.requirementText,
            status: result.status,
            whatWasChecked: result.whatWasChecked || 'Not specified',
            evidence: result.evidence,
            evidenceLocation: result.evidenceLocation || 'Not specified',
            reasoning: result.reasoning,
            sectionsReferenced: result.sectionsReferenced || 'Not specified',
            contentTypes: result.contentTypes || 'Not specified'
          })
        } else if (result.status === 'NOT_APPLICABLE') {
          notApplicableItems.push({
            element: element.element,
            requirement: element.requirementText,
            status: result.status,
            whatWasChecked: result.whatWasChecked || 'Not specified',
            evidence: result.evidence,
            evidenceLocation: result.evidenceLocation || 'Not specified',
            reasoning: result.reasoning,
            sectionsReferenced: result.sectionsReferenced || 'Not specified',
            contentTypes: result.contentTypes || 'Not specified'
          })
        } else {
          nonCompliantItems.push({
            element: element.element,
            requirement: element.requirementText,
            status: result.status,
            whatWasChecked: result.whatWasChecked || 'Not specified',
            evidence: result.evidence || 'No evidence found',
            evidenceLocation: result.evidenceLocation || 'Not found',
            reasoning: result.reasoning,
            sectionsReferenced: result.sectionsReferenced || 'Not specified',
            contentTypes: result.contentTypes || 'Not specified'
          })
        }
      } catch (error) {
        console.error('Validation error:', error)
      }
    }

    return { compliantItems, nonCompliantItems, notApplicableItems }
  }

  // Handle manual upload
  const handleManualUpload = async () => {
    if (!manualFile || !manualYear) return

    setProcessing(true)
    const shortYear = manualYear.toString().slice(-2)
    setStatus(`Extracting text from compliance manual for year ${manualYear}...`)

    try {
      const content = await extractTextFromPDF(manualFile)
      setStatus('Analyzing compliance requirements with AI...')
      
      const rules = await extractComplianceRules(content)
      setManualRules(rules)
      setActiveRuleYear(shortYear)
      
      // Save to file via backend (both default and year-specific folder)
      setStatus(`Saving rules to data/${shortYear}/...`)
      await saveRulesToFile(rules, manualYear)
      
      setStatus(`✅ Success! Extracted ${rules.length} compliance requirements for ${manualYear}. Rules saved to data/${shortYear}/compliance-rules.json`)
      setActiveTab('analyze')
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`)
    } finally {
      setProcessing(false)
    }
  }

  // Extract HRSA announcement number from application content (e.g., HRSA-26-004 -> "26")
  const extractAnnouncementYear = (content) => {
    const match = content.match(/HRSA[-\s](\d{2})[-\s]\d{3}/i)
    if (match) {
      return match[1]
    }
    return null
  }

  // Handle application analysis
  const handleApplicationAnalysis = async () => {
    if (!applicationFile || !manualRules) return

    setProcessing(true)
    setStatus('Generating file hash...')
    
    const startTime = Date.now()

    try {
      // Generate hash for the application file
      const fileHash = await generateFileHash(applicationFile)
      setApplicationFileHash(fileHash)
      
      if (!fileHash) {
        throw new Error('Failed to generate file hash')
      }
      
      // Check cache first
      setStatus('🔍 Checking cache for previous analysis...')
      const cachedData = await checkCache(fileHash, manualVersion)
      
      if (cachedData) {
        // Cache hit! Load results from cache
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`⏱️  Loaded from cache in ${totalTime}s`)
        setCacheStatus(`✅ Loaded from cache (analyzed on ${new Date(cachedData.timestamp).toLocaleString()})`)
        setResults(cachedData.results)
        setStatus(`✅ Analysis loaded from cache! (Original analysis: ${new Date(cachedData.timestamp).toLocaleString()})`)
        setActiveTab('results')
        setProcessing(false)
        return
      }
      
      // Cache miss - proceed with full analysis
      // Clear all status messages and start progress log
      setStatus('')
      setCacheStatus('')
      setProgressLog(['🔄 No cache found - running full analysis...', '📄 Extracting text from application...'])
      
      const extractionStartTime = Date.now()
      const content = await extractTextFromPDF(applicationFile)
      const extractionTime = ((Date.now() - extractionStartTime) / 1000).toFixed(1)
      console.log(`📄 Text extraction took ${extractionTime}s`)
      
      // Save extracted text to file for review
      try {
        const sanitizedName = (applicationName || applicationFile.name).replace(/[^a-zA-Z0-9.-]/g, '_')
        await axios.post(`${BACKEND_URL}/api/save-extracted-text`, {
          filename: sanitizedName,
          content: content
        })
        setProgressLog(prev => [...prev, `✅ Text extraction complete (${extractionTime}s) — saved to data/extracted-text/`])
      } catch (err) {
        console.error('Could not save extracted text:', err)
        setProgressLog(prev => [...prev, `✅ Text extraction complete (${extractionTime}s)`])
      }

      // Extract announcement number to determine which year's rules to use
      const announcementYear = extractAnnouncementYear(content)
      let rulesToUse = manualRules
      let ruleYearLabel = activeRuleYear ? `20${activeRuleYear}` : 'default'
      
      if (announcementYear) {
        setDetectedRuleYear(announcementYear)
        setProgressLog(prev => [...prev, `🔍 Detected Funding Opportunity: HRSA-${announcementYear}-XXX`])
        
        const yearRulesAvailable = availableRuleYears.find(y => y.year === announcementYear)
        
        if (yearRulesAvailable) {
          if (activeRuleYear !== announcementYear) {
            setProgressLog(prev => [...prev, `📂 Loading rules for year 20${announcementYear}...`])
            try {
              const response = await axios.get(`${BACKEND_URL}/api/load-rules/${announcementYear}`)
              if (response.data.success) {
                rulesToUse = response.data.rules
                setManualRules(rulesToUse)
                setActiveRuleYear(announcementYear)
                ruleYearLabel = `20${announcementYear}`
                setProgressLog(prev => [...prev, `✅ Loaded ${rulesToUse.length} chapters from 20${announcementYear} rules`])
              }
            } catch (err) {
              console.error('Error loading year-specific rules:', err)
              setProgressLog(prev => [...prev, `⚠️ Could not load 20${announcementYear} rules, using currently loaded rules`])
            }
          } else {
            ruleYearLabel = `20${announcementYear}`
            setProgressLog(prev => [...prev, `✅ Already using 20${announcementYear} rules`])
          }
        } else {
          setProgressLog(prev => [...prev, `⚠️ No rules found for year 20${announcementYear} — using currently loaded rules (${ruleYearLabel})`])
        }
      } else {
        setProgressLog(prev => [...prev, `ℹ️ No HRSA announcement number detected — using currently loaded rules (${ruleYearLabel})`])
      }

      setProgressLog(prev => [...prev, `📋 Validating against ${ruleYearLabel} compliance rules`])

      const analysisStartTime = Date.now()
      
      // Process ALL sections in ONE API call (MAXIMUM OPTIMIZATION)
      console.log(`🚀 Starting single-call validation for all ${SECTIONS.length} sections`)
      
      let sectionResults = {}
      try {
        sectionResults = await retryWithBackoff(
          () => validateComplianceAll(rulesToUse, content, (progressMsg, append = false) => {
            if (append) {
              setProgressLog(prev => [...prev, progressMsg])
            } else {
              setStatus(progressMsg)
            }
          }),
          'All Sections (Single Call)'
        )
        setProgressLog(prev => [...prev, '✅ AI analysis complete! Parsing results...'])
        console.log(`✓ Completed all ${SECTIONS.length} sections in ONE API call!`)
      } catch (error) {
        console.error(`❌ Single-call validation failed: ${error.message}`)
        console.log(`⚠️ Falling back to per-section validation...`)
        
        // Fallback to per-section validation if single-call fails
        for (let i = 0; i < SECTIONS.length; i++) {
          const section = SECTIONS[i]
          setStatus(`Analyzing ${section} (${i + 1}/${SECTIONS.length})... [Fallback mode]`)
          
          try {
            const result = await retryWithBackoff(
              () => validateComplianceBatch(section, rulesToUse, content),
              section
            )
            sectionResults[section] = result
            console.log(`✓ Completed ${i + 1}/${SECTIONS.length}: ${section}`)
          } catch (error) {
            console.error(`Failed ${section}:`, error.message)
            sectionResults[section] = { error: error.message, compliantItems: [], nonCompliantItems: [], notApplicableItems: [] }
          }
          
          // Delay between sections to avoid rate limits
          if (i < SECTIONS.length - 1) {
            setStatus(`⏳ Waiting 25 seconds before next section... (${i + 1}/${SECTIONS.length} completed)`)
            await new Promise(resolve => setTimeout(resolve, 25000))
          }
        }
      }
      
      const totalAnalysisTime = ((Date.now() - analysisStartTime) / 1000).toFixed(1)
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`⏱️  Analysis completed in ${totalAnalysisTime}s (Total: ${totalTime}s)`)
      
      // Save results to cache
      setStatus('💾 Saving results to cache...')
      await saveToCache(fileHash, manualVersion, {
        applicationName,
        extractedContent: content,
        results: sectionResults
      })
      
      // Refresh cached applications list so dashboard updates
      await loadCachedApplications()
      
      setResults(sectionResults)
      setCacheStatus('✅ Analysis complete and cached!')
      setStatus(`✅ Analysis complete! (Total time: ${totalTime}s)`)
      setActiveTab('results')
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`)
      setCacheStatus('')
    } finally {
      setProcessing(false)
    }
  }

  // Chat handler for querying application data
  const handleChatSubmit = async (e) => {
    e.preventDefault()
    if (!chatInput.trim() || !results) return

    const userMessage = { role: 'user', content: chatInput }
    setChatMessages(prev => [...prev, userMessage])
    setChatInput('')
    setChatLoading(true)

    try {
      // Prepare context from results
      const context = {
        applicationName: applicationName,
        sections: SECTIONS.map(section => {
          const result = results[section]
          if (!result) return null
          return {
            section: section,
            compliantCount: result.compliantItems?.length || 0,
            nonCompliantCount: result.nonCompliantItems?.length || 0,
            notApplicableCount: result.notApplicableItems?.length || 0,
            compliantItems: result.compliantItems || [],
            nonCompliantItems: result.nonCompliantItems || [],
            notApplicableItems: result.notApplicableItems || []
          }
        }).filter(Boolean)
      }

      // Build prompt for AI
      const prompt = `You are an AI assistant helping analyze HRSA compliance review results.

APPLICATION: ${applicationName}

COMPLIANCE SUMMARY:
${context.sections.map(s => `
${s.section}:
- Compliant: ${s.compliantCount}
- Non-Compliant: ${s.nonCompliantCount}
- Not Applicable: ${s.notApplicableCount}
`).join('\n')}

DETAILED DATA:
${JSON.stringify(context, null, 2)}

USER QUESTION: ${chatInput}

IMPORTANT FORMATTING INSTRUCTIONS:
1. Use clear section headers with **bold text** (e.g., **Compliant Items:**)
2. Use bullet points (•) for lists
3. Use numbered lists (1., 2., 3.) for sequential items
4. Add blank lines between sections for readability
5. Keep responses concise but informative
6. When listing items, include:
   - Element name
   - Status (if relevant)
   - Brief reasoning (if asked)
7. Format example:

**Section Name:**

• Item 1: Description here
• Item 2: Description here

**Summary:**
Brief summary text here.

Provide a clear, well-formatted answer based on the compliance data above.`

      const response = await axios.post(
        `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
        {
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 2000
        },
        {
          headers: {
            'api-key': AZURE_OPENAI_KEY,
            'Content-Type': 'application/json'
          }
        }
      )

      const aiResponse = response.data.choices[0].message.content
      const assistantMessage = { role: 'assistant', content: aiResponse }
      setChatMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage = { 
        role: 'assistant', 
        content: `❌ Error: ${error.message}. Please try again.` 
      }
      setChatMessages(prev => [...prev, errorMessage])
    } finally {
      setChatLoading(false)
    }
  }

  // Authentication handlers
  const handleLogin = (userData) => {
    setIsAuthenticated(true)
    setCurrentUser(userData)
    localStorage.setItem('hrsaAuth', JSON.stringify(userData))
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setCurrentUser(null)
    localStorage.removeItem('hrsaAuth')
    // Clear application state
    setActiveTab('dashboard')
    setResults(null)
    setApplicationFile(null)
    setApplicationName('')
  }

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault()
    e.currentTarget.classList.add('dragover')
  }

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('dragover')
  }

  const handleDrop = (e, setter) => {
    e.preventDefault()
    e.currentTarget.classList.remove('dragover')
    const file = e.dataTransfer.files[0]
    if (file && file.type === 'application/pdf') {
      setter(file)
      // Auto-populate application name if dropping on application upload
      if (setter === setApplicationFile) {
        const fileName = file.name.replace('.pdf', '')
        setApplicationName(fileName)
      }
    }
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="container">
      <div className="header" style={{ padding: '25px 30px', position: 'relative' }}>
        <div style={{ 
          position: 'absolute', 
          top: '8px', 
          right: '30px',
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px',
          fontSize: '0.8rem',
          color: '#FFFFFF'
        }}>
          <span>{currentUser?.username}</span>
          <span style={{ opacity: '0.5' }}>|</span>
          <button
            onClick={handleLogout}
            style={{
              background: 'none',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: '400',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: '0',
              transition: 'opacity 0.3s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            Logout
          </button>
        </div>
        <div style={{ 
          position: 'absolute', 
          top: '38px', 
          right: '30px',
          display: 'flex',
          alignItems: 'center'
        }}>
          <img 
            src="/image/HRSA-Logo-White.png"
            alt="HRSA Logo" 
            style={{ 
              height: '55px', 
              width: 'auto'
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{
              width: '60px',
              height: '60px',
              border: '3px solid #FFFFFF',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              background: 'rgba(255, 255, 255, 0.1)'
            }}>
              <svg width="38" height="38" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="12" r="3" fill="#FF69B4" />
                <circle cx="20" cy="20" r="4" fill="#FFFFFF" />
                <circle cx="12" cy="28" r="2.5" fill="#FFFFFF" />
                <circle cx="28" cy="28" r="2.5" fill="#FFFFFF" />
                <line x1="20" y1="15" x2="20" y2="16" stroke="#FFFFFF" strokeWidth="2" />
                <line x1="20" y1="24" x2="15" y2="26" stroke="#FFFFFF" strokeWidth="2" />
                <line x1="20" y1="24" x2="25" y2="26" stroke="#FFFFFF" strokeWidth="2" />
                <circle cx="8" cy="20" r="2" fill="#FFFFFF" />
                <circle cx="32" cy="20" r="2" fill="#FFFFFF" />
                <line x1="16" y1="20" x2="10" y2="20" stroke="#FFFFFF" strokeWidth="2" />
                <line x1="24" y1="20" x2="30" y2="20" stroke="#FFFFFF" strokeWidth="2" />
              </svg>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <h1 style={{ 
                margin: 0, 
                fontSize: '1.6rem',
                fontWeight: '600',
                color: '#FFFFFF',
                lineHeight: '1.3'
              }}>
                AI Review Assistant
              </h1>
              <p style={{ 
                margin: 0, 
                fontSize: '0.85rem',
                color: '#FFFFFF',
                opacity: '0.9',
                lineHeight: '1.3'
              }}>
                AI-Powered Document Intelligence for Pre-Funding Review
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          <button 
            className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            1. Upload Manual
          </button>
          <button 
            className={`tab ${activeTab === 'analyze' ? 'active' : ''}`}
            onClick={() => setActiveTab('analyze')}
            disabled={!manualRules}
          >
            2. Analyze Application
          </button>
          <button 
            className={`tab ${activeTab === 'results' ? 'active' : ''}`}
            onClick={() => setActiveTab('results')}
            disabled={!results}
          >
            3. View Results
          </button>
          <button 
            className={`tab ${activeTab === 'compare' ? 'active' : ''}`}
            onClick={() => setActiveTab('compare')}
            disabled={!results}
          >
            Compare with Project Officer Review
          </button>
          <button 
            className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            ⚙️ Settings
          </button>
        </div>

        {activeTab === 'dashboard' && (
          <div>
            <h2 style={{ color: '#99000', marginBottom: '20px' }}>Dashboard - Analyzed Applications</h2>
            
            {/* Search Bar */}
            <div style={{ marginBottom: '30px' }}>
              <input
                type="text"
                placeholder="🔍 Search by application name..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1); // Reset to first page on search
                }}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  fontSize: '1rem',
                  background: '#EFF6FB',
                  border: '2px solid #D9E8F6',
                  borderRadius: '8px',
                  color: '#0B4778',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#D9E8F6'}
              />
            </div>

            {/* Applications Grid */}
            {cachedApplications.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '2px dashed #D9E8F6'
              }}>
                <div style={{ fontSize: '4rem', marginBottom: '20px' }}>📂</div>
                <h3 style={{ color: '#0B4778', marginBottom: '10px' }}>No Analyzed Applications Yet</h3>
                <p style={{ color: '#0B4778', fontSize: '0.9rem' }}>
                  Upload and analyze your first application to see it here
                </p>
              </div>
            ) : (() => {
              // Remove duplicates by application number, keeping the most recent one
              const uniqueAppsMap = new Map();
              cachedApplications.forEach(app => {
                const appNum = app.applicationNumber;
                if (!appNum) {
                  // If no app number, use cache key as unique identifier
                  uniqueAppsMap.set(app.cacheKey, app);
                } else {
                  // If duplicate app number, keep the one with the most recent timestamp
                  const existing = uniqueAppsMap.get(appNum);
                  if (!existing || new Date(app.timestamp) > new Date(existing.timestamp)) {
                    uniqueAppsMap.set(appNum, app);
                  }
                }
              });
              
              const uniqueApps = Array.from(uniqueAppsMap.values());
              
              // Filter applications based on search query
              const filteredApps = uniqueApps.filter(app => 
                !searchQuery || 
                app.applicationName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                app.applicationNumber?.toLowerCase().includes(searchQuery.toLowerCase())
              );
              
              // Calculate pagination
              const totalPages = Math.ceil(filteredApps.length / itemsPerPage);
              const startIndex = (currentPage - 1) * itemsPerPage;
              const endIndex = startIndex + itemsPerPage;
              const currentApps = filteredApps.slice(startIndex, endIndex);
              
              // Reset to page 1 if current page is out of bounds
              if (currentPage > totalPages && totalPages > 0) {
                setCurrentPage(1);
              }
              
              return (
                <>
                  {/* Results count */}
                  <div style={{ 
                    marginBottom: '20px', 
                    color: '#0B4778',
                    fontSize: '1rem',
                    fontWeight: '600'
                  }}>
                    Showing {startIndex + 1}-{Math.min(endIndex, filteredApps.length)} of {filteredApps.length} applications
                  </div>
                  
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '20px'
                  }}>
                    {currentApps.map((app, index) => (
                    <div
                      key={index}
                      style={{
                        background: '#EFF6FB',
                        border: '2px solid #D9E8F6',
                        borderRadius: '12px',
                        padding: '20px',
                        transition: 'all 0.3s',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#3b82f6'
                        e.currentTarget.style.transform = 'translateY(-5px)'
                        e.currentTarget.style.boxShadow = '0 10px 25px rgba(59, 130, 246, 0.2)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#D9E8F6'
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      <div style={{ marginBottom: '15px' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '10px' }}>📄</div>
                        <h3 style={{
                          color: '#0B4778',
                          fontSize: '1.1rem',
                          marginBottom: '8px',
                          fontWeight: '600',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {app.applicationName || 'Unnamed Application'}
                        </h3>
                        <p style={{
                          color: '#0B4778',
                          fontSize: '0.9rem',
                          marginBottom: '5px',
                          fontWeight: '500'
                        }}>
                          📅 {new Date(app.timestamp).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        <p style={{
                          color: '#0B4778',
                          fontSize: '0.85rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: 'monospace',
                          fontWeight: '500'
                        }}>
                          🔑 {app.cacheKey.substring(0, 12)}...
                        </p>
                      </div>
                      
                      <button
                        onClick={() => viewCachedApplication(app.cacheKey)}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.9rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.3s'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#2563eb'}
                        onMouseLeave={(e) => e.target.style.background = '#3b82f6'}
                      >
                        View Results
                      </button>
                    </div>
                  ))}
                  </div>
                  
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '10px',
                      marginTop: '30px',
                      flexWrap: 'wrap'
                    }}>
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        style={{
                          padding: '10px 20px',
                          background: currentPage === 1 ? '#D9E8F6' : '#3b82f6',
                          color: currentPage === 1 ? '#3b82f6' : 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.9rem',
                          fontWeight: '600',
                          cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                          transition: 'all 0.3s'
                        }}
                        onMouseEnter={(e) => {
                          if (currentPage !== 1) e.target.style.background = '#2563eb';
                        }}
                        onMouseLeave={(e) => {
                          if (currentPage !== 1) e.target.style.background = '#3b82f6';
                        }}
                      >
                        ← Previous
                      </button>
                      
                      <div style={{ 
                        display: 'flex', 
                        gap: '5px',
                        alignItems: 'center'
                      }}>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                          // Show first page, last page, current page, and pages around current
                          const showPage = page === 1 || 
                                          page === totalPages || 
                                          Math.abs(page - currentPage) <= 1;
                          
                          // Show ellipsis
                          if (!showPage) {
                            if (page === currentPage - 2 || page === currentPage + 2) {
                              return <span key={page} style={{ color: '#3b82f6', padding: '0 5px' }}>...</span>;
                            }
                            return null;
                          }
                          
                          return (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              style={{
                                padding: '10px 15px',
                                background: currentPage === page ? '#3b82f6' : 'white',
                                color: currentPage === page ? 'white' : '#3b82f6',
                                border: currentPage === page ? 'none' : '2px solid #3b82f6',
                                borderRadius: '6px',
                                fontSize: '0.9rem',
                                fontWeight: currentPage === page ? '600' : '400',
                                cursor: 'pointer',
                                transition: 'all 0.3s',
                                minWidth: '40px'
                              }}
                              onMouseEnter={(e) => {
                                if (currentPage !== page) {
                                  e.target.style.borderColor = '#3b82f6';
                                  e.target.style.color = '#f1f5f9';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (currentPage !== page) {
                                  e.target.style.borderColor = '#3b82f6';
                                  e.target.style.color = '#3b82f6';
                                }
                              }}
                            >
                              {page}
                            </button>
                          );
                        })}
                      </div>
                      
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        style={{
                          padding: '10px 20px',
                          background: currentPage === totalPages ? 'white' : '#3b82f6',
                          color: currentPage === totalPages ? '#3b82f6' : 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.9rem',
                          fontWeight: '600',
                          cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                          transition: 'all 0.3s'
                        }}
                        onMouseEnter={(e) => {
                          if (currentPage !== totalPages) e.target.style.background = '#2563eb';
                        }}
                        onMouseLeave={(e) => {
                          if (currentPage !== totalPages) e.target.style.background = '#3b82f6';
                        }}
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              );
            })()}

            {/* No Search Results */}
            {cachedApplications.length > 0 && 
             searchQuery && 
             cachedApplications.filter(app => 
               app.applicationName?.toLowerCase().includes(searchQuery.toLowerCase())
             ).length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                background: '#EFF6FB',
                borderRadius: '12px',
                border: '2px solid #D9E8F6',
                marginTop: '20px'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '15px' }}>🔍</div>
                <h3 style={{ color: '#0B4778', marginBottom: '8px' }}>No Results Found</h3>
                <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
                  No applications match "{searchQuery}"
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'upload' && (
          <div>
            {!manualRules ? (
              <>
                <h2 style={{ color: '#990000' }}>Upload Guiding Principles Document</h2>
                
                {/* Year Selection Dropdown */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#0B4778', fontSize: '1rem' }}>
                    Select Guidance Year
                  </label>
                  <select
                    value={manualYear}
                    onChange={(e) => setManualYear(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '1rem',
                      border: '2px solid #D9E8F6',
                      borderRadius: '8px',
                      background: 'white',
                      color: '#0B4778',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {Array.from({ length: new Date().getFullYear() - 2020 }, (_, i) => 2021 + i).map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '6px' }}>
                    Rules will be saved to folder: <strong>data/{manualYear.toString().slice(-2)}/</strong>
                  </p>
                </div>

                {/* Show existing rule years if any */}
                {availableRuleYears.length > 0 && (
                  <div style={{ 
                    marginBottom: '20px', 
                    padding: '15px', 
                    background: '#EFF6FB', 
                    borderRadius: '8px', 
                    border: '1px solid #D9E8F6' 
                  }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#0B4778', marginBottom: '10px' }}>
                      📂 Existing Rule Sets (click to load):
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {availableRuleYears.map(y => (
                        <button
                          key={y.year}
                          onClick={() => loadSavedRules(y.year)}
                          style={{
                            padding: '8px 16px',
                            background: activeRuleYear === y.year ? '#0B4778' : 'white',
                            color: activeRuleYear === y.year ? 'white' : '#0B4778',
                            border: '2px solid #0B4778',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            transition: 'all 0.2s'
                          }}
                        >
                          {y.fullYear} ({y.chaptersCount} chapters)
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div 
                  className="upload-section"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, setManualFile)}
                  onClick={() => document.getElementById('manual-input').click()}
                >
                  <div className="upload-icon">📄</div>
                  <h3>{manualFile ? manualFile.name : 'Drop PDF here or click to upload'}</h3>
                  <p>Guiding Principles Document PDF for {manualYear}</p>
                  <input 
                    id="manual-input"
                    type="file" 
                    accept=".pdf"
                    onChange={(e) => setManualFile(e.target.files[0])}
                  />
                </div>
                <button 
                  className="btn" 
                  onClick={handleManualUpload}
                  disabled={!manualFile || !manualYear || processing}
                >
                  {processing ? 'Processing...' : `Extract Compliance Rules (${manualYear})`}
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 style={{ color: '#0B4778' }}>
                    ✅ Compliance Rules Loaded ({manualRules.length} Chapters)
                    {activeRuleYear && <span style={{ fontSize: '0.9rem', color: '#3b82f6', marginLeft: '10px' }}>— Year: 20{activeRuleYear}</span>}
                  </h2>
                  <button 
                    className="btn" 
                    onClick={() => {
                      setManualRules(null)
                      setManualFile(null)
                      setResults(null)
                      setActiveRuleYear('')
                      setStatus('Upload a new guiding principles document to extract rules (previous rules will be overwritten)')
                    }}
                    style={{
                      background: '#3b82f6',
                      fontSize: '0.9rem',
                      padding: '8px 16px',
                      maxWidth: '50%'
                    }}
                  >
                    📤 Upload New Guiding Principles Document
                  </button>
                </div>

                {/* Year selector for switching between loaded rule sets */}
                {availableRuleYears.length > 0 && (
                  <div style={{ 
                    marginBottom: '20px', 
                    padding: '15px', 
                    background: '#EFF6FB', 
                    borderRadius: '8px', 
                    border: '1px solid #D9E8F6' 
                  }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#0B4778', marginBottom: '10px' }}>
                      📂 Available Rule Sets (click to switch):
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {availableRuleYears.map(y => (
                        <button
                          key={y.year}
                          onClick={() => loadSavedRules(y.year)}
                          style={{
                            padding: '8px 16px',
                            background: activeRuleYear === y.year ? '#0B4778' : 'white',
                            color: activeRuleYear === y.year ? 'white' : '#0B4778',
                            border: '2px solid #0B4778',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            transition: 'all 0.2s'
                          }}
                        >
                          {y.fullYear} ({y.chaptersCount} chapters)
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {manualRules && manualRules.length > 0 && (
              <div className="results" style={{ marginTop: '30px' }}>
                <h2 style={{ color: '#0B4778' }}>✅ Extracted Compliance Requirements ({manualRules.length} Chapters)</h2>
                <p style={{ marginBottom: '20px', color: '#0B4778', fontSize: '1rem', fontWeight: '500' }}>
                  The following compliance chapters were extracted from the HRSA Compliance Manual and will be used to validate applications:
                </p>
                
                {manualRules.map((chapter, chapterIdx) => {
                  const uploadChapterKey = `upload-chapter-${chapterIdx}`
                  const isUploadChapterExpanded = expandedDetails[uploadChapterKey] || false
                  
                  return (
                    <div key={chapterIdx} className="section" style={{ marginBottom: '30px', border: '1px solid #D9E8F6', borderRadius: '8px', padding: '20px', background: 'white' }}>
                    <button
                      onClick={() => setExpandedDetails(prev => ({...prev, [uploadChapterKey]: !isUploadChapterExpanded}))}
                      style={{
                        width: '100%',
                        padding: '15px 20px',
                        background: '#EFF6FB',
                        border: '1px solid #D9E8F6',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.3s',
                        marginBottom: isUploadChapterExpanded ? '15px' : '0'
                      }}
                    >
                      <h3 style={{ margin: '0', fontSize: '1.2rem', fontWeight: '700', color: '#0B4778' }}>
                        <span style={{ color: '#0B4778' }}>📋 {chapter.chapter || chapter.section}</span>
                      </h3>
                      <span style={{ fontSize: '1.5rem', transition: 'transform 0.3s', transform: isUploadChapterExpanded ? 'rotate(180deg)' : 'rotate(0deg)', color: '#93c5fd' }}>
                        ▼
                      </span>
                    </button>
                    
                    {isUploadChapterExpanded && chapter.authority && (
                      <div style={{
                        marginBottom: '20px',
                        padding: '12px',
                        background: '#EFF6FB',
                        borderRadius: '6px',
                        border: '1px solid #D9E8F6'
                      }}>
                        <strong style={{ color: '#0B4778' }}>📜 Authority:</strong>
                        <p style={{
                          margin: '5px 0 0 0',
                          fontSize: '0.9rem',
                          color: '#1e3a5f'
                        }}>
                          {chapter.authority}
                        </p>
                      </div>
                    )}
                    
                    {isUploadChapterExpanded && chapter.elements && chapter.elements.length > 0 && (
                      <div>
                        <h4 style={{ marginBottom: '15px', color: '#0B4778', fontSize: '1rem', fontWeight: '600' }}>
                          Elements ({chapter.elements.length} requirements):
                        </h4>
                        {chapter.elements.map((element, elemIdx) => (
                          <div key={elemIdx} className="item" style={{ borderLeft: '4px solid #3b82f6', padding: '15px', marginBottom: '15px', background: 'white', borderRadius: '4px', border: '1px solid #D9E8F6' }}>
                            <div style={{ marginBottom: '12px' }}>
                              <strong style={{ color: '#3b82f6', fontSize: '1.05rem' }}>
                                {element.element || `Element ${elemIdx + 1}`}
                              </strong>
                            </div>
                            
                            <div style={{ marginBottom: '12px' }}>
                              <strong style={{ color: '#0B4778' }}>📝 Requirement:</strong>
                              <p style={{ margin: '5px 0 0 0', lineHeight: '1.6', color: '#000000' }}>
                                {element.requirementText}
                              </p>
                            </div>
                            
                            {element.requirementDetails && element.requirementDetails.length > 0 && (
                              <div style={{ marginBottom: '12px', padding: '12px', background: '#EFF6FB', borderRadius: '6px', border: '1px solid #D9E8F6' }}>
                                <strong style={{ color: '#0B4778' }}>📋 Must Address:</strong>
                                <ul style={{ margin: '8px 0 0 20px', lineHeight: '1.8' }}>
                                  {element.requirementDetails.map((detail, i) => (
                                    <li key={i} style={{ fontSize: '0.95rem', color: '#1e3a5f', marginBottom: '8px' }}>{detail}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {element.applicationSection && (
                              <div style={{ marginBottom: '12px', padding: '10px', background: '#fff5c2', borderRadius: '6px', border: '1px solid #fee685' }}>
                                <strong style={{ color: '#565c65' }}>🔍 Application Section to Review:</strong>
                                <p style={{ margin: '5px 0 0 0', fontSize: '0.9rem', color: '#565c65' }}>
                                  {element.applicationSection}
                                </p>
                              </div>
                            )}
                            
                            {element.applicationItems && element.applicationItems.length > 0 && (
                              <div style={{ marginBottom: '12px', padding: '10px', background: '#e8f5e9', borderRadius: '6px', border: '1px solid #a5d6a7' }}>
                                <strong style={{ color: '#2e7d32' }}>✓ Items to Check:</strong>
                                <ul style={{ margin: '8px 0 0 20px', lineHeight: '1.8' }}>
                                  {element.applicationItems.map((item, i) => (
                                    <li key={i} style={{ fontSize: '0.95rem', color: '#1b5e20' }}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {element.footnotes && (
                              <div style={{ marginTop: '12px', padding: '10px', background: '#fff5c2', fontSize: '0.85rem', color: '#565c65', border: '1px solid #fee685', borderRadius: '6px' }}>
                                <strong style={{ color: '#565c65' }}>ℹ️ Note:</strong> {element.footnotes}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )})}
              </div>
            )}
          </div>
        )}

        {activeTab === 'analyze' && (
          <div>
            <h2 style={{ color: '#990000' }}>Analyze Health Center Application</h2>
            <div className="input-group">
              <label>Application Name</label>
              <input 
                type="text"
                placeholder="e.g., Community Health Center 2024"
                value={applicationName}
                onChange={(e) => setApplicationName(e.target.value)}
              />
            </div>
            <div 
              className="upload-section"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, setApplicationFile)}
              onClick={() => document.getElementById('app-input').click()}
            >
              <div className="upload-icon">📑</div>
              <h3 style={{ color: '#0B4778', fontWeight: '600' }}>{applicationFile ? applicationFile.name : 'Drop PDF here or click to upload'}</h3>
              <p style={{ color: '#0B4778', fontSize: '1rem', fontWeight: '600' }}>Health Center Application PDF</p>
              <input 
                id="app-input"
                type="file" 
                accept=".pdf"
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (file) {
                    setApplicationFile(file)
                    // Auto-populate application name from filename (remove .pdf extension)
                    const fileName = file.name.replace('.pdf', '')
                    setApplicationName(fileName)
                  }
                }}
              />
            </div>
            <button 
              className="btn" 
              onClick={handleApplicationAnalysis}
              disabled={!applicationFile || !applicationName || processing}
            >
              {processing ? 'Analyzing...' : 'Analyze Compliance'}
            </button>
            
            {status && progressLog.length === 0 && (
              <div className="status processing" style={{ marginTop: '20px' }}>
                {status}
              </div>
            )}
            
            {progressLog.length > 0 && (
              <div style={{ 
                marginTop: '20px', 
                padding: '15px', 
                background: '#FFFFFF', 
                border: '1px solid #D9E8F6', 
                borderRadius: '8px',
                maxHeight: '300px',
                overflowY: 'auto'
              }}>
                <div style={{ fontSize: '0.9rem', color: '#0B4778', fontFamily: 'monospace' }}>
                  {progressLog.map((log, index) => (
                    <div key={index} style={{ marginBottom: '5px', padding: '3px 0' }}>
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {cacheStatus && progressLog.length === 0 && (
              <div style={{ marginTop: '20px', padding: '12px', background: '#EFF6FB', border: '1px solid #D9E8F6', borderRadius: '8px', color: '#0B4778', textAlign: 'center' }}>
                {cacheStatus}
              </div>
            )}
          </div>
        )}

        {activeTab === 'results' && results && (
          <div className="results" style={{ display: 'flex', gap: '20px' }}>
            {/* Hidden PDF re-upload input for cached applications */}
            <input
              id="pdf-reupload-input"
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={handlePdfReupload}
            />
            
            {/* PDF Upload Banner - shown when no PDF is loaded */}
            {!pdfFile && (
              <div 
                onClick={() => document.getElementById('pdf-reupload-input')?.click()}
                style={{
                  position: 'fixed',
                  bottom: '20px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(59, 130, 246, 0.5)',
                  zIndex: 900,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 6px 30px rgba(59, 130, 246, 0.7)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.5)'}
              >
                📄 Upload Application PDF to enable page viewer
              </div>
            )}

            {/* Results Panel */}
            <div style={{ 
              flex: showPDFViewer ? '1' : '1', 
              transition: 'all 0.3s ease',
              paddingRight: '10px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <h2 style={{ margin: 0, color: '#990000' }}>
                  📊 Review Results: {applicationName}
                  {activeRuleYear && (
                    <span style={{ 
                      marginLeft: '12px', 
                      fontSize: '0.8rem', 
                      background: '#0B4778', 
                      color: 'white', 
                      padding: '4px 12px', 
                      borderRadius: '20px', 
                      verticalAlign: 'middle',
                      fontWeight: '600'
                    }}>
                      Rules: 20{activeRuleYear}
                    </span>
                  )}
                </h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                onClick={exportResultsToWord}
                style={{
                  padding: '10px 20px',
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  transition: 'all 0.3s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => e.target.style.background = '#1d4ed8'}
                onMouseLeave={(e) => e.target.style.background = '#2563eb'}
              >
                📄 Export to Word
              </button>
                </div>
              </div>
            
            {/* Summary Statistics */}
            {(() => {
              let totalCompliant = 0
              let totalNonCompliant = 0
              let totalNotApplicable = 0
              
              SECTIONS.forEach(section => {
                const result = results[section]
                if (result) {
                  totalCompliant += result.compliantItems?.length || 0
                  totalNonCompliant += result.nonCompliantItems?.length || 0
                  totalNotApplicable += result.notApplicableItems?.length || 0
                }
              })
              
              const totalItems = totalCompliant + totalNonCompliant + totalNotApplicable
              const complianceRate = totalItems > 0 ? ((totalCompliant / totalItems) * 100).toFixed(1) : 0
              
              return (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '20px', 
                  marginBottom: '40px' 
                }}>
                  {/* Total Items */}
                  <div style={{ 
                    background: '#f0f9ff', 
                    border: '2px solid #3b82f6', 
                    borderRadius: '12px', 
                    padding: '20px', 
                    textAlign: 'center' 
                  }}>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#3b82f6', marginBottom: '8px' }}>
                      {totalItems}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '500' }}>
                      Total Requirements
                    </div>
                  </div>
                  
                  {/* Non-Compliant Items */}
                  <div 
                    onClick={() => {
                      setNavigationMode('non-compliance');
                      setCurrentItemIndex(0);
                      // Expand all chapters
                      const allChapters = {};
                      SECTIONS.forEach(section => {
                        allChapters[`chapter-${section}`] = true;
                      });
                      setExpandedDetails(allChapters);
                      // Scroll to first non-compliant item
                      setTimeout(() => {
                        const firstItem = document.querySelector('[id^="non-compliance-"]');
                        if (firstItem) {
                          firstItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          setHighlightedItemId(firstItem.id);
                        }
                      }, 200);
                    }}
                    style={{ 
                      background: '#fef2f2', 
                      border: '2px solid #ef4444', 
                      borderRadius: '12px', 
                      padding: '20px', 
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#ef4444', marginBottom: '8px' }}>
                      {totalNonCompliant}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '500' }}>
                      Non-Compliant
                    </div>
                  </div>
                  
                  {/* Not Applicable Items */}
                  <div 
                    onClick={() => {
                      setNavigationMode('not-applicable');
                      setCurrentItemIndex(0);
                      // Expand all chapters
                      const allChapters = {};
                      SECTIONS.forEach(section => {
                        allChapters[`chapter-${section}`] = true;
                      });
                      setExpandedDetails(allChapters);
                      // Scroll to first not-applicable item
                      setTimeout(() => {
                        const firstItem = document.querySelector('[id^="not-applicable-"]');
                        if (firstItem) {
                          firstItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          setHighlightedItemId(firstItem.id);
                        }
                      }, 200);
                    }}
                    style={{ 
                      background: '#f8fafc', 
                      border: '2px solid #94a3b8', 
                      borderRadius: '12px', 
                      padding: '20px', 
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(100, 116, 139, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#94a3b8', marginBottom: '8px' }}>
                      {totalNotApplicable}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '500' }}>
                      Not Applicable
                    </div>
                  </div>
                  
                  {/* Compliant Items */}
                  <div 
                    onClick={() => {
                      setNavigationMode('compliance');
                      setCurrentItemIndex(0);
                      // Expand all chapters
                      const allChapters = {};
                      SECTIONS.forEach(section => {
                        allChapters[`chapter-${section}`] = true;
                      });
                      setExpandedDetails(allChapters);
                      // Scroll to first compliant item
                      setTimeout(() => {
                        const firstItem = document.querySelector('[id^="compliance-"]');
                        if (firstItem) {
                          firstItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          setHighlightedItemId(firstItem.id);
                        }
                      }, 200);
                    }}
                    style={{ 
                      background: '#f0fdf4', 
                      border: '2px solid #10b981', 
                      borderRadius: '12px', 
                      padding: '20px', 
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#10b981', marginBottom: '8px' }}>
                      {totalCompliant}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '500' }}>
                      Compliant
                    </div>
                  </div>
                  
                  {/* Compliance Rate */}
                  <div style={{ 
                    background: '#fefce8', 
                    border: `2px solid ${complianceRate >= 80 ? '#10b981' : complianceRate >= 50 ? '#f59e0b' : '#ef4444'}`, 
                    borderRadius: '12px', 
                    padding: '20px', 
                    textAlign: 'center' 
                  }}>
                    <div style={{ 
                      fontSize: '2.5rem', 
                      fontWeight: 'bold', 
                      color: complianceRate >= 80 ? '#10b981' : complianceRate >= 50 ? '#f59e0b' : '#ef4444',
                      marginBottom: '8px' 
                    }}>
                      {complianceRate}%
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '500' }}>
                      Compliance Rate
                    </div>
                  </div>
                </div>
              )
            })()}
            
            {/* Navigation Mode Indicator */}
            {navigationMode && (
              <div style={{ 
                marginTop: '20px', 
                padding: '15px 20px', 
                background: '#EFF6FB', 
                border: '1px solid #D9E8F6',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ color: '#0B4778', fontSize: '1rem', fontWeight: '600' }}>
                  🎯 Navigation Mode: {navigationMode === 'compliance' ? '✅ Compliant Items' : navigationMode === 'non-compliance' ? '❌ Non-Compliant Items' : '⊘ Not Applicable Items'} - Press Enter for next item
                </span>
                <button
                  onClick={() => {
                    setNavigationMode(null);
                    setHighlightedItemId(null);
                    setCurrentItemIndex(0);
                  }}
                  style={{
                    padding: '8px 16px',
                    background: '#3b82f6',
                    border: 'none',
                    borderRadius: '6px',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '0.9rem'
                  }}
                >
                  Exit Navigation
                </button>
              </div>
            )}
            
            {SECTIONS.map(section => {
              const result = results[section]
              if (!result) return null

              // Find the chapter from manualRules
              const chapter = manualRules?.find(r => r.section === section || section.includes(r.section) || r.section.includes(section))
              if (!chapter) return null

              const chapterKey = `chapter-${section}`
              const isChapterExpanded = expandedDetails[chapterKey] || false

              return (
                <div key={section} style={{ marginBottom: '40px', border: '1px solid #D9E8F6', borderRadius: '12px', padding: '20px', background: '#FFFFFF' }}>
                  <button
                    onClick={() => setExpandedDetails(prev => ({...prev, [chapterKey]: !isChapterExpanded}))}
                    style={{
                      width: '100%',
                      padding: '15px 20px',
                      background: '#EFF6FB',
                      border: '1px solid #D9E8F6',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'all 0.3s'
                    }}
                  >
                    <h3 style={{ color: '#0B4778', margin: '0', fontSize: '1.4rem', fontWeight: '700' }}>
                      📋 {chapter.chapter || chapter.section}
                    </h3>
                    <span style={{ fontSize: '1.5rem', transition: 'transform 0.3s', transform: isChapterExpanded ? 'rotate(180deg)' : 'rotate(0deg)', color: '#93c5fd' }}>
                      ▼
                    </span>
                  </button>
                  
                  {isChapterExpanded && chapter.elements && chapter.elements.map((element, elemIdx) => {
                    // Helper function to strip prefixes and suffixes
                    const stripPrefix = (text) => {
                      return text
                        .replace(/^REQUIREMENT \d+\.\d+:\s*/i, '')
                        .replace(/^\d+\.\d+:\s*/, '')
                        .replace(/^\d+\.\d+\s*-\s*/, '')
                        .replace(/^Element\s+[a-h]\s*-\s*/i, '')
                        .replace(/\s*\(Not Applicable for Look-Alikes\)\s*$/i, '')
                        .replace(/\s*\(Not Applicable for Look-alikes\)\s*$/i, '')
                        .trim()
                    }
                    
                    // Find validation result for this element
                    const allItems = [...result.compliantItems, ...result.nonCompliantItems, ...(result.notApplicableItems || [])]
                    const validationResult = allItems.find(item => {
                      if (!item.element || !element.element) return false
                      // Try exact match first
                      if (item.element === element.element) return true
                      
                      // Strip prefixes and compare core names
                      const itemCore = stripPrefix(item.element)
                      const elemCore = stripPrefix(element.element)
                      const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim()
                      if (normalizeText(itemCore) === normalizeText(elemCore)) return true
                      
                      // Try matching on "Element X" pattern
                      const elementPattern = /element\s+[a-h]/i
                      const itemMatch = item.element.match(elementPattern)
                      const elemMatch = element.element.match(elementPattern)
                      if (itemMatch && elemMatch && itemMatch[0].toLowerCase() === elemMatch[0].toLowerCase()) return true
                      return false
                    })
                    
                    const isCompliant = result.compliantItems.some(item => {
                      if (!item.element || !element.element) return false
                      if (item.element === element.element) return true
                      
                      // Use the same stripPrefix function defined above
                      const itemCore = stripPrefix(item.element)
                      const elemCore = stripPrefix(element.element)
                      
                      const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim()
                      if (normalizeText(itemCore) === normalizeText(elemCore)) return true
                      
                      // Also try matching by element letter (a, b, c, etc.)
                      const elementPattern = /element\s+[a-h]/i
                      const itemMatch = item.element.match(elementPattern)
                      const elemMatch = element.element.match(elementPattern)
                      if (itemMatch && elemMatch && itemMatch[0].toLowerCase() === elemMatch[0].toLowerCase()) return true
                      
                      return false
                    })
                    
                    const detailKey = `${section}-${elemIdx}`
                    const showDetails = expandedDetails[detailKey] || false
                    
                    // Check if this is a NOT_APPLICABLE status
                    const isNotApplicable = validationResult && validationResult.status === 'NOT_APPLICABLE'
                    
                    // Generate unique ID for navigation - use index from the correct array
                    const itemType = isNotApplicable ? 'not-applicable' : (isCompliant ? 'compliance' : 'non-compliance')
                    let itemIndex = 0
                    if (isNotApplicable) {
                      itemIndex = result.notApplicableItems.findIndex(item => {
                        const itemCore = stripPrefix(item.element)
                        const elemCore = stripPrefix(element.element)
                        const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim()
                        return normalizeText(itemCore) === normalizeText(elemCore)
                      })
                    } else if (isCompliant) {
                      itemIndex = result.compliantItems.findIndex(item => {
                        const itemCore = stripPrefix(item.element)
                        const elemCore = stripPrefix(element.element)
                        const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim()
                        return normalizeText(itemCore) === normalizeText(elemCore)
                      })
                    } else {
                      itemIndex = result.nonCompliantItems.findIndex(item => {
                        const itemCore = stripPrefix(item.element)
                        const elemCore = stripPrefix(element.element)
                        const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim()
                        return normalizeText(itemCore) === normalizeText(elemCore)
                      })
                    }
                    const itemId = `${section}-${itemType}-${itemIndex}`
                    const isHighlighted = highlightedItemId === itemId
                    
                    // Determine border and badge colors
                    const borderColor = isNotApplicable ? '#64748b' : (isCompliant ? '#10b981' : '#ef4444')
                    const badgeColor = isNotApplicable ? '#64748b' : (isCompliant ? '#10b981' : '#ef4444')
                    const badgeText = isNotApplicable ? '⊘ NOT APPLICABLE' : (isCompliant ? '✅ COMPLIANT' : '❌ NON-COMPLIANT')
                    
                    return (
                      <div 
                        key={elemIdx}
                        id={itemId}
                        style={{ 
                          marginTop: elemIdx === 0 ? '20px' : '0',
                          marginBottom: '20px', 
                          border: `2px solid ${borderColor}`,
                          borderRadius: '10px',
                          padding: '20px',
                          background: isHighlighted ? '#FFFFFF' : '#EFF6FB',
                          boxShadow: isHighlighted ? '0 0 20px rgba(59, 130, 246, 0.5)' : 'none',
                          transition: 'all 0.3s ease'
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                          <div style={{ flex: 1 }}>
                            <strong style={{ color: '#0B4778', fontSize: '1.1rem', display: 'block', marginBottom: '8px' }}>
                              {element.element || `Element ${elemIdx + 1}`}
                            </strong>
                            <p style={{ margin: '0', color: '#64748b', lineHeight: '1.6', fontSize: '0.95rem' }}>
                              {element.requirementText}
                            </p>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '20px' }}>
                            <span style={{ 
                              padding: '8px 16px', 
                              borderRadius: '20px', 
                              background: badgeColor,
                              color: 'white',
                              fontWeight: 'bold',
                              fontSize: '0.9rem',
                              whiteSpace: 'nowrap'
                            }}>
                              {badgeText}
                            </span>
                          </div>
                        </div>
                        
                        {element.requirementDetails && element.requirementDetails.length > 0 && (
                          <div style={{ marginTop: '15px' }}>
                            <button
                              onClick={() => {
                                const mustAddressKey = `mustAddress-${section}-${elemIdx}`
                                setExpandedDetails(prev => ({...prev, [mustAddressKey]: !prev[mustAddressKey]}))
                              }}
                              style={{
                                width: '100%',
                                padding: '12px 15px',
                                background: '#FFFFFF',
                                border: '1px solid #D9E8F6',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '0.95rem',
                                fontWeight: '600',
                                color: '#0B4778',
                                transition: 'all 0.3s'
                              }}
                            >
                              <span>📋 Must Address ({element.requirementDetails.length} items)</span>
                              <span style={{ fontSize: '1.2rem', transition: 'transform 0.3s', transform: expandedDetails[`mustAddress-${section}-${elemIdx}`] ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                ▼
                              </span>
                            </button>
                            {expandedDetails[`mustAddress-${section}-${elemIdx}`] && (
                              <div style={{ 
                                marginTop: '8px',
                                padding: '15px', 
                                background: '#FFFFFF', 
                                borderRadius: '8px', 
                                border: '1px solid #D9E8F6',
                                animation: 'slideDown 0.3s ease-out'
                              }}>
                                <ul style={{ margin: '0', paddingLeft: '20px', lineHeight: '1.8' }}>
                                  {element.requirementDetails.map((detail, i) => (
                                    <li key={i} style={{ fontSize: '0.9rem', color: '#1e3a5f', marginBottom: '6px' }}>{detail}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {validationResult && (
                          <>
                            {/* Rule Context Section */}
                            <div style={{ marginTop: '15px' }}>
                              <button
                                onClick={() => setExpandedDetails(prev => ({...prev, [`context-${section}-${elemIdx}`]: !prev[`context-${section}-${elemIdx}`]}))}
                                style={{
                                  width: '100%',
                                  padding: '12px 15px',
                                  background: '#FFFFFF',
                                  border: '1px solid #D9E8F6',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  fontSize: '0.95rem',
                                  fontWeight: '600',
                                  color: '#0B4778',
                                  transition: 'all 0.3s'
                                }}
                              >
                                <span>📋 Show Requirement Details</span>
                                <span style={{ fontSize: '1.2rem', transition: 'transform 0.3s', transform: expandedDetails[`context-${section}-${elemIdx}`] ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                  ▼
                                </span>
                              </button>
                            </div>

                            {expandedDetails[`context-${section}-${elemIdx}`] && (
                              <div style={{ 
                                marginTop: '15px', 
                                padding: '20px', 
                                background: '#FFFFFF',
                                borderRadius: '8px',
                                border: '1px solid #D9E8F6',
                                animation: 'slideDown 0.3s ease-out'
                              }}>
                                {/* Authority */}
                                {chapter.authority && (
                                  <div style={{ marginBottom: '20px' }}>
                                    <strong style={{ color: '#0B4778', display: 'block', marginBottom: '8px', fontSize: '0.95rem' }}>
                                      ⚖️ Authority / Statutory requirement(s):
                                    </strong>
                                    <div style={{ 
                                      padding: '12px', 
                                      background: '#EFF6FB', 
                                      borderRadius: '6px',
                                      borderLeft: '4px solid #0B4778'
                                    }}>
                                      <p style={{ margin: '0', fontSize: '0.85rem', color: '#1e3a5f', lineHeight: '1.6' }}>
                                        {chapter.authority}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Application Section */}
                                {element.applicationSection && (
                                  <div style={{ marginBottom: '20px' }}>
                                    <strong style={{ color: '#0B4778', display: 'block', marginBottom: '8px', fontSize: '0.95rem' }}>
                                      📂 Sections of the Application to review:
                                    </strong>
                                    <div style={{ 
                                      padding: '12px', 
                                      background: '#EFF6FB', 
                                      borderRadius: '6px',
                                      borderLeft: '4px solid #0B4778'
                                    }}>
                                      <p style={{ margin: '0', fontSize: '0.85rem', color: '#1e3a5f' }}>
                                        {element.applicationSection}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Application Items Checklist */}
                                {element.applicationItems && element.applicationItems.length > 0 && (
                                  <div style={{ marginBottom: '20px' }}>
                                    <strong style={{ color: '#06b6d4', display: 'block', marginBottom: '8px', fontSize: '0.95rem' }}>
                                      ✓ Specific Items to Check:
                                    </strong>
                                    <div style={{ 
                                      padding: '12px', 
                                      background: '#EFF6FB', 
                                      borderRadius: '6px',
                                      borderLeft: '4px solid #06b6d4'
                                    }}>
                                      <ul style={{ margin: '0', paddingLeft: '20px', lineHeight: '1.8' }}>
                                        {element.applicationItems.map((item, i) => (
                                          <li key={i} style={{ fontSize: '0.85rem', color: '#1e3a5f', marginBottom: '8px' }}>
                                            {item}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                )}

                                {/* Notes/Footnotes */}
                                {element.footnotes && (
                                  <div>
                                    <strong style={{ color: '#0B4778', display: 'block', marginBottom: '8px', fontSize: '0.95rem' }}>
                                      📌 Footer Notes:
                                    </strong>
                                    <div style={{ 
                                      padding: '12px', 
                                      background: '#EFF6FB', 
                                      borderRadius: '6px',
                                      borderLeft: '4px solid #0B4778'
                                    }}>
                                      <p style={{ margin: '0', fontSize: '0.85rem', color: '#1e3a5f', lineHeight: '1.6' }}>
                                        {element.footnotes}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Evidence and Reasoning Section */}
                            <div style={{ marginTop: '15px' }}>
                              <button
                                onClick={() => setExpandedDetails(prev => ({...prev, [detailKey]: !showDetails}))}
                                style={{
                                  width: '100%',
                                  padding: '12px 15px',
                                  background: '#FFFFFF',
                                  border: '1px solid #D9E8F6',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  fontSize: '0.95rem',
                                  fontWeight: '600',
                                  color: '#0B4778',
                                  transition: 'all 0.3s'
                                }}
                              >
                                <span>🔍 Show Evidence and Reasoning</span>
                                <span style={{ fontSize: '1.2rem', transition: 'transform 0.3s', transform: showDetails ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                  ▼
                                </span>
                              </button>
                            </div>
                          </>
                        )}
                        
                        {validationResult && showDetails && (
                          <div style={{ 
                            marginTop: '15px', 
                            padding: '20px', 
                            background: '#FFFFFF',
                            borderRadius: '8px',
                            border: '1px solid #D9E8F6',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            animation: 'slideDown 0.3s ease-out'
                          }}>
                            {/* Items to Check from extracted rules */}
                            {element.applicationItems && element.applicationItems.length > 0 && (
                              <div style={{ marginBottom: '20px' }}>
                                <strong style={{ color: '#3b82f6', display: 'block', marginBottom: '12px', fontSize: '1rem' }}>
                                  ✓ Items to Check:
                                </strong>
                                <div style={{ 
                                  padding: '15px', 
                                  background: '#EFF6FB', 
                                  borderRadius: '6px',
                                  borderLeft: '4px solid #3b82f6'
                                }}>
                                  <ul style={{ margin: '0', paddingLeft: '20px', lineHeight: '1.8' }}>
                                    {element.applicationItems.map((item, i) => (
                                      <li key={i} style={{ fontSize: '0.9rem', color: '#1e3a5f', marginBottom: '6px' }}>
                                        {item}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            )}
                            
                            <div style={{ marginBottom: '20px' }}>
                              <div style={{ marginBottom: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <strong style={{ 
                                    color: isCompliant ? '#10b981' : '#ef4444',
                                    fontSize: '0.95rem'
                                  }}>
                                    {isCompliant ? '✅ Evidence Found:' : '❌ Evidence:'}
                                  </strong>
                                  <button
                                    onClick={() => {
                                      let copyText = `Evidence:\n${validationResult.evidence}\n\n`
                                      
                                      // Add Evidence Source & Location
                                      const evidenceSection = validationResult.evidenceSection && validationResult.evidenceSection !== 'Not found' 
                                        ? validationResult.evidenceSection 
                                        : element.applicationSection
                                      
                                      if (evidenceSection) {
                                        copyText += `Found in Document/Section:\n${evidenceSection}\n\n`
                                      }
                                      
                                      if (validationResult.evidenceLocation && validationResult.evidenceLocation !== 'Not found') {
                                        copyText += `Page Number(s):\n${validationResult.evidenceLocation}\n\n`
                                      }
                                      
                                      if (validationResult.evidenceReferences && validationResult.evidenceReferences.length > 0) {
                                        copyText += `References:\n${validationResult.evidenceReferences.join('\n')}`
                                      }
                                      
                                      navigator.clipboard.writeText(copyText.trim()).then(() => {
                                        alert('✅ Evidence with source & location copied to clipboard!')
                                      }).catch(() => {
                                        alert('❌ Failed to copy')
                                      })
                                    }}
                                    style={{
                                      padding: '6px 12px',
                                      background: '#3b82f6',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '0.8rem',
                                      fontWeight: '600',
                                      transition: 'all 0.3s'
                                    }}
                                    onMouseEnter={(e) => e.target.style.background = '#2563eb'}
                                    onMouseLeave={(e) => e.target.style.background = '#3b82f6'}
                                  >
                                    📋 Copy
                                  </button>
                                </div>
                                    {/* Source Traceability Section - Prominently displayed */}
                                    <div style={{ 
                                      marginBottom: '12px',
                                      padding: '12px',
                                      background: '#FFFFFF',
                                      borderRadius: '6px',
                                      border: '2px solid #3b82f6'
                                    }}>
                                      <div style={{ 
                                        fontSize: '0.85rem', 
                                        color: '#3b82f6', 
                                        marginBottom: '10px',
                                        fontWeight: '700',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                      }}>
                                        📍 Evidence Source & Location
                                      </div>
                                      
                                      {/* Evidence Section - Show first if available, fallback to applicationSection */}
                                      {((validationResult.evidenceSection && validationResult.evidenceSection !== 'Not found') || element.applicationSection) && (
                                        <div style={{ 
                                          display: 'flex', 
                                          alignItems: 'center', 
                                          gap: '8px',
                                          marginBottom: '8px',
                                          padding: '10px 12px',
                                          background: '#EFF6FB',
                                          borderRadius: '4px',
                                          border: '1px solid #D9E8F6'
                                        }}>
                                          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>📂</span>
                                          <div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '3px', fontWeight: '600' }}>
                                              Found in Document/Section:
                                            </div>
                                            <div style={{ fontSize: '0.95rem', color: '#0B4778', fontWeight: '600' }}>
                                              {validationResult.evidenceSection && validationResult.evidenceSection !== 'Not found' 
                                                ? validationResult.evidenceSection 
                                                : element.applicationSection}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      
                                      {/* Evidence Location - Page Numbers (Individually Clickable) */}
                                      {validationResult.evidenceLocation && validationResult.evidenceLocation !== 'Not found' && (
                                        <div style={{ 
                                          marginBottom: '8px',
                                          padding: '8px 10px',
                                          background: '#EFF6FB',
                                          borderRadius: '4px',
                                          border: '1px solid #D9E8F6'
                                        }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '1rem' }}>📄</span>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600' }}>
                                              Page Number(s) - Click to view:
                                            </span>
                                          </div>
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {parsePageNumbers(validationResult.evidenceLocation).map((pageNum) => (
                                              <span
                                                key={pageNum}
                                                onClick={() => navigateToEvidence(`Page ${pageNum}`, validationResult.evidence)}
                                                style={{
                                                  fontSize: '0.85rem',
                                                  color: '#FFFFFF',
                                                  background: '#3b82f6',
                                                  padding: '4px 12px',
                                                  borderRadius: '4px',
                                                  fontWeight: '600',
                                                  cursor: 'pointer',
                                                  transition: 'all 0.2s ease',
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  gap: '4px'
                                                }}
                                                onMouseEnter={(e) => {
                                                  e.currentTarget.style.background = '#2563eb'
                                                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.5)'
                                                  e.currentTarget.style.transform = 'translateY(-1px)'
                                                }}
                                                onMouseLeave={(e) => {
                                                  e.currentTarget.style.background = '#3b82f6'
                                                  e.currentTarget.style.boxShadow = 'none'
                                                  e.currentTarget.style.transform = 'none'
                                                }}
                                                title={`View Page ${pageNum} in PDF`}
                                              >
                                                🔍 Page {pageNum}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {/* Page References */}
                                      {validationResult.evidenceReferences && validationResult.evidenceReferences.length > 0 && (
                                        <div style={{ 
                                          padding: '8px 10px',
                                          background: '#EFF6FB',
                                          borderRadius: '4px',
                                          border: '1px solid #D9E8F6'
                                        }}>
                                          <div style={{ 
                                            fontSize: '0.75rem', 
                                            color: '#94a3b8', 
                                            marginBottom: '6px',
                                            fontWeight: '600'
                                          }}>
                                            📌 Page References:
                                          </div>
                                          <div style={{ 
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: '6px'
                                          }}>
                                            {validationResult.evidenceReferences.map((ref, idx) => (
                                              <span 
                                                key={idx} 
                                                onClick={() => navigateToEvidence(ref, validationResult.evidence)}
                                                style={{ 
                                                  fontSize: '0.85rem', 
                                                  color: '#f1f5f9',
                                                  background: '#3b82f6',
                                                  padding: '4px 10px',
                                                  borderRadius: '4px',
                                                  fontWeight: '600',
                                                  display: 'inline-block',
                                                  cursor: 'pointer',
                                                  transition: 'all 0.2s ease'
                                                }}
                                                onMouseEnter={(e) => {
                                                  e.currentTarget.style.background = '#2563eb'
                                                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.5)'
                                                }}
                                                onMouseLeave={(e) => {
                                                  e.currentTarget.style.background = '#3b82f6'
                                                  e.currentTarget.style.boxShadow = 'none'
                                                }}
                                                title="Click to view in PDF"
                                              >
                                                🔍 {ref}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  {(() => {
                                    const evidence = validationResult.evidence || 'Not found'
                                    
                                    // Function to highlight quoted text
                                    const highlightQuotes = (text) => {
                                      // Match text in quotes: "..." or '...'
                                      const parts = text.split(/("[^"]*"|'[^']*')/)
                                      return parts.map((part, i) => {
                                        if (part.match(/^["'].*["']$/)) {
                                          // This is a quoted section - highlight it
                                          return (
                                            <span key={i} style={{ 
                                              background: 'linear-gradient(120deg, #fef08a 0%, #fde047 100%)',
                                              padding: '2px 6px',
                                              borderRadius: '3px',
                                              fontWeight: '600',
                                              color: '#333',
                                              border: '1px solid #facc15'
                                            }}>
                                              {part}
                                            </span>
                                          )
                                        }
                                        return part
                                      })
                                    }
                                    
                                    // Check if evidence is "not found" or similar
                                    if (evidence.toLowerCase().includes('not found') || 
                                        evidence.toLowerCase().includes('no evidence') ||
                                        evidence.toLowerCase().includes('no explicit') ||
                                        evidence.length < 100) {
                                      return (
                                        <p style={{ 
                                          margin: '0',
                                          fontSize: '0.9rem',
                                          color: '#555',
                                          fontStyle: 'italic'
                                        }}>
                                          {evidence}
                                        </p>
                                      )
                                    }
                                    
                                    // Split long evidence into bullet points by sentences
                                    const sentences = evidence.split(/\.\s+/).filter(s => s.trim().length > 20)
                                    
                                    if (sentences.length > 2) {
                                      return (
                                        <ul style={{ margin: '0', paddingLeft: '20px', lineHeight: '1.7' }}>
                                          {sentences.map((sentence, i) => {
                                            const fullSentence = sentence.trim() + (sentence.trim().endsWith('.') ? '' : '.')
                                            return (
                                              <li key={i} style={{ fontSize: '0.9rem', color: '#1e3a5f', marginBottom: '8px' }}>
                                                {highlightQuotes(fullSentence)}
                                              </li>
                                            )
                                          })}
                                        </ul>
                                      )
                                    } else {
                                      return (
                                        <p style={{ 
                                          margin: '0',
                                          fontSize: '0.9rem',
                                          color: '#1e3a5f',
                                          lineHeight: '1.6'
                                        }}>
                                          {highlightQuotes(evidence)}
                                        </p>
                                      )
                                    }
                                  })()}
                                </div>
                            </div>
                            
                            {validationResult.mustAddressValidation && validationResult.mustAddressValidation.length > 0 && (
                              <div style={{ marginTop: '20px' }}>
                                <strong style={{ color: '#3b82f6', display: 'block', marginBottom: '12px', fontSize: '1rem' }}>
                                  ✓ Must Address Items Validation:
                                </strong>
                                <div style={{ 
                                  padding: '15px', 
                                  background: '#FFFFFF', 
                                  borderRadius: '6px',
                                  border: '1px solid #D9E8F6'
                                }}>
                                  {validationResult.mustAddressValidation.map((item, idx) => (
                                    <div key={idx} style={{ 
                                      marginBottom: idx < validationResult.mustAddressValidation.length - 1 ? '15px' : '0',
                                      paddingBottom: idx < validationResult.mustAddressValidation.length - 1 ? '15px' : '0',
                                      borderBottom: idx < validationResult.mustAddressValidation.length - 1 ? '1px solid #D9E8F6' : 'none'
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>
                                          {item.status === 'found' ? '✅' : '❌'}
                                        </span>
                                        <div style={{ flex: 1 }}>
                                          <p style={{ 
                                            margin: '0 0 8px 0', 
                                            fontSize: '0.9rem', 
                                            color: '#cbd5e1',
                                            fontWeight: '600'
                                          }}>
                                            {item.item}
                                          </p>
                                          {item.status === 'found' ? (
                                            <>
                                              <p style={{ 
                                                margin: '0', 
                                                fontSize: '0.85rem', 
                                                color: '#94a3b8',
                                                fontStyle: 'italic'
                                              }}>
                                                Evidence: <span style={{ 
                                                  background: 'linear-gradient(120deg, #fef08a 0%, #fde047 100%)',
                                                  padding: '2px 6px',
                                                  borderRadius: '3px',
                                                  fontWeight: '600',
                                                  color: '#333',
                                                  border: '1px solid #facc15',
                                                  fontStyle: 'normal'
                                                }}>{item.evidence}</span>
                                              </p>
                                              {item.page && item.page !== 'Not found' && (
                                                <p style={{ 
                                                  margin: '4px 0 0 0', 
                                                  fontSize: '0.8rem', 
                                                  color: '#64748b'
                                                }}>
                                                  📄 {item.page}
                                                </p>
                                              )}
                                            </>
                                          ) : (
                                            <p style={{ 
                                              margin: '0', 
                                              fontSize: '0.85rem', 
                                              color: '#ef4444',
                                              fontStyle: 'italic'
                                            }}>
                                              No evidence found in application
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            <div style={{ 
                              padding: '18px', 
                              background: '#EFF6FB',
                              borderRadius: '8px',
                              borderLeft: `4px solid ${isCompliant ? '#10b981' : '#f59e0b'}`
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <strong style={{ 
                                  color: '#0B4778',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  fontSize: '1rem'
                                }}>
                                  <span style={{ fontSize: '1.2rem' }}>💡</span>
                                  <span>Reasoning:</span>
                                </strong>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  {(() => {
                                    const speechKey = `${section}-${elemIdx}`
                                    const isPlaying = speechStatus[speechKey] || false
                                    
                                    return (
                                      <button
                                        onClick={() => {
                                          if (isPlaying) {
                                            // Pause current speech
                                            window.speechSynthesis.pause()
                                            setSpeechStatus(prev => ({...prev, [speechKey]: false}))
                                          } else {
                                            // Always cancel any existing speech first
                                            window.speechSynthesis.cancel()
                                            
                                            // Reset ALL speech status states (all sections become green/read)
                                            setSpeechStatus({})
                                            
                                            // Wait for cancel to complete, then start new speech
                                            setTimeout(() => {
                                              const utterance = new SpeechSynthesisUtterance(validationResult.reasoning)
                                              utterance.rate = 0.9
                                              utterance.pitch = 1
                                              utterance.volume = 1
                                              
                                              // Update status when speech ends
                                              utterance.onend = () => {
                                                setSpeechStatus(prev => ({...prev, [speechKey]: false}))
                                              }
                                              
                                              window.speechSynthesis.speak(utterance)
                                              setSpeechStatus({[speechKey]: true}) // Only this section is playing
                                            }, 100)
                                          }
                                        }}
                                        style={{
                                          padding: '6px 12px',
                                          background: isPlaying ? '#f59e0b' : '#10b981',
                                          color: 'white',
                                          border: 'none',
                                          borderRadius: '4px',
                                          cursor: 'pointer',
                                          fontSize: '0.8rem',
                                          fontWeight: '600',
                                          transition: 'all 0.3s'
                                        }}
                                        onMouseEnter={(e) => e.target.style.background = isPlaying ? '#d97706' : '#059669'}
                                        onMouseLeave={(e) => e.target.style.background = isPlaying ? '#f59e0b' : '#10b981'}
                                      >
                                        {isPlaying ? '⏸️ Pause' : '▶️ Read'}
                                      </button>
                                    )
                                  })()}
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(validationResult.reasoning).then(() => {
                                        alert('✅ Reasoning copied to clipboard!')
                                      }).catch(() => {
                                        alert('❌ Failed to copy')
                                      })
                                    }}
                                    style={{
                                      padding: '6px 12px',
                                      background: '#3b82f6',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '0.8rem',
                                      fontWeight: '600',
                                      transition: 'all 0.3s'
                                    }}
                                    onMouseEnter={(e) => e.target.style.background = '#2563eb'}
                                    onMouseLeave={(e) => e.target.style.background = '#3b82f6'}
                                  >
                                    📋 Copy
                                  </button>
                                </div>
                              </div>
                              <p style={{ 
                                margin: '0',
                                fontSize: '0.95rem',
                                color: '#1e3a5f',
                                lineHeight: '1.8',
                                textAlign: 'justify'
                              }}>
                                {validationResult.reasoning}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
            </div>
            
            {/* PDF Viewer Drawer - Slides in from right like Chat */}
            <div style={{
              position: 'fixed',
              top: '0',
              right: showPDFViewer ? '0' : '-600px',
              width: '600px',
              height: '100vh',
              background: '#0f172a',
              borderLeft: '2px solid #3b82f6',
              boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.5)',
              transition: 'right 0.3s ease-in-out',
              zIndex: 999,
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* PDF Viewer Header */}
              <div style={{
                padding: '15px 20px',
                background: '#FFFFFF',
                borderBottom: '2px solid #D9E8F6',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.3rem'
                  }}>📄</div>
                  <div>
                    <h3 style={{ margin: 0, color: '#0B4778', fontSize: '1.1rem', fontWeight: '600' }}>PDF Viewer</h3>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>
                      {highlightPDFPage ? `Viewing Page ${highlightPDFPage}` : 'Application Document'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPDFViewer(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    padding: '0',
                    lineHeight: '1'
                  }}
                >
                  ✕
                </button>
              </div>
              
              {/* PDF Content */}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <PDFViewer 
                  pdfFile={pdfFile} 
                  highlightPage={highlightPDFPage}
                  highlightText={highlightText}
                  onLoadSuccess={(numPages) => console.log(`PDF loaded with ${numPages} pages`)}
                />
              </div>
            </div>
            
            {/* AI Chat Assistant - Right Drawer */}
            <div style={{
            position: 'fixed',
            top: '0',
            right: showChat ? '0' : '-450px',
            width: '450px',
            height: '100vh',
            background: '#1e293b',
            borderLeft: '2px solid #3b82f6',
            boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.5)',
            transition: 'right 0.3s ease-in-out',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Chat Header */}
            <div style={{
              padding: '20px',
              background: '#FFFFFF',
              borderBottom: '2px solid #D9E8F6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.3rem'
                }}>🤖</div>
                <div>
                  <h3 style={{ margin: 0, color: '#0B4778', fontSize: '1.2rem', fontWeight: '600' }}>Chat Assistant</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>Ask about compliance items</p>
                </div>
              </div>
              <button
                onClick={() => setShowChat(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0',
                  lineHeight: '1'
                }}
              >
                ✕
              </button>
            </div>
            
            {/* Chat Messages */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              background: '#EFF6FB'
            }}>
              {chatMessages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '15px' }}>💬</div>
                  <p style={{ fontSize: '0.9rem', marginBottom: '10px' }}>Ask me anything about this application!</p>
                  <p style={{ fontSize: '0.8rem', color: '#475569' }}>
                    Examples:<br/>
                    • Show me compliant items<br/>
                    • What items are non-compliant and why?<br/>
                    • List not applicable items
                  </p>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div key={idx} style={{
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                  }}>
                    <div style={{
                      maxWidth: '85%',
                      padding: '14px 18px',
                      borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: msg.role === 'user' ? '#3b82f6' : '#FFFFFF',
                      color: msg.role === 'user' ? '#FFFFFF' : '#1e293b',
                      fontSize: '0.9rem',
                      lineHeight: '1.7',
                      border: msg.role === 'assistant' ? '1px solid #D9E8F6' : 'none',
                      boxShadow: msg.role === 'user' ? '0 2px 8px rgba(59, 130, 246, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}>
                      {msg.content.split('\n').map((line, i) => (
                        <div key={i} style={{ marginBottom: line.trim() === '' ? '10px' : '0' }}>
                          {line.startsWith('• ') || line.startsWith('- ') ? (
                            <div style={{ paddingLeft: '10px', marginBottom: '6px' }}>
                              <span style={{ color: msg.role === 'user' ? '#93c5fd' : '#3b82f6', marginRight: '8px' }}>•</span>
                              {line.replace(/^[•-]\s*/, '')}
                            </div>
                          ) : line.match(/^\d+\.\s/) ? (
                            <div style={{ paddingLeft: '10px', marginBottom: '6px' }}>
                              <span style={{ color: msg.role === 'user' ? '#93c5fd' : '#3b82f6', marginRight: '8px', fontWeight: '600' }}>{line.match(/^\d+\./)[0]}</span>
                              {line.replace(/^\d+\.\s*/, '')}
                            </div>
                          ) : line.startsWith('**') && line.endsWith('**') ? (
                            <div style={{ fontWeight: '700', color: '#93c5fd', marginTop: '12px', marginBottom: '8px' }}>
                              {line.replace(/\*\*/g, '')}
                            </div>
                          ) : (
                            <span>{line}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: '#64748b',
                  fontSize: '0.9rem'
                }}>
                  <div className="spinner" style={{ width: '20px', height: '20px' }}></div>
                  <span>Thinking...</span>
                </div>
              )}
            </div>
            
            {/* Chat Input */}
            <form onSubmit={handleChatSubmit} style={{
              padding: '20px',
              borderTop: '2px solid #D9E8F6',
              background: '#FFFFFF'
            }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about compliance items..."
                  disabled={chatLoading}
                  style={{
                    flex: 1,
                    padding: '10px 15px',
                    background: '#FFFFFF',
                    border: '2px solid #D9E8F6',
                    borderRadius: '8px',
                    color: '#0B4778',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = '#D9E8F6'}
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  style={{
                    padding: '10px 20px',
                    background: chatLoading || !chatInput.trim() ? '#D9E8F6' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: chatLoading || !chatInput.trim() ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '600'
                  }}
                >
                  Send
                </button>
              </div>
            </form>
          </div>
          
          {/* Chat Toggle Button */}
          <button
            onClick={() => setShowChat(true)}
            style={{
              position: 'fixed',
              bottom: '20px',
              right: '20px',
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              border: 'none',
              color: 'white',
              fontSize: '1.8rem',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(59, 130, 246, 0.4)',
              zIndex: 999,
              transition: 'all 0.3s',
              display: showChat ? 'none' : 'block'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'scale(1.1)';
              e.target.style.boxShadow = '0 6px 25px rgba(59, 130, 246, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'scale(1)';
              e.target.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.4)';
            }}
          >
            💬
          </button>
        </div>
        )}

        {activeTab === 'compare' && (
          <div>
            <h2 style={{ color: '#0B4778', marginBottom: '20px' }}>🔍 Compare Agent Analysis with Project Officer Review</h2>
            
            {!showComparison ? (
              <div>
                <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '0.95rem' }}>
                  Upload a project officer review PDF to compare it side-by-side with the AI analysis results.
                  The application number should be in the filename.
                </p>
                
                <div 
                  className="upload-section"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, setManualReviewFile)}
                  onClick={() => document.getElementById('manual-review-input').click()}
                  style={{ marginBottom: '20px' }}
                >
                  <div className="upload-icon">📄</div>
                  <h3>{manualReviewFile ? manualReviewFile.name : 'Drop Project Officer Review PDF here or click to upload'}</h3>
                  <p>Project Officer Review Document PDF</p>
                  <input 
                    id="manual-review-input"
                    type="file" 
                    accept=".pdf"
                    onChange={(e) => setManualReviewFile(e.target.files[0])}
                  />
                </div>
                
                <button 
                  className="btn" 
                  onClick={handleManualReviewUpload}
                  disabled={!manualReviewFile || processing}
                >
                  {processing ? 'Processing...' : 'Load Manual Review'}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '20px',
                  padding: '15px',
                  background: '#EFF6FB',
                  borderRadius: '8px',
                  border: '1px solid #D9E8F6'
                }}>
                  <div>
                    <h3 style={{ color: '#0B4778', margin: '0 0 5px 0' }}>
                      📊 Comparison View
                    </h3>
                    <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.9rem' }}>
                      Application: {applicationName}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={exportComparisonToExcel}
                      style={{
                        padding: '8px 16px',
                        background: '#f0fdf4',
                        color: '#10b981',
                        border: '2px solid #10b981',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        transition: 'all 0.3s'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = '#d1fae5'
                        e.target.style.transform = 'translateY(-1px)'
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = '#f0fdf4'
                        e.target.style.transform = 'translateY(0)'
                      }}
                    >
                      📊 Export to Excel
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await axios.post(`${BACKEND_URL}/api/manual-review/clear-cache`)
                          alert('✅ Manual review cache cleared!')
                        } catch (error) {
                          alert('❌ Failed to clear cache: ' + error.message)
                        }
                      }}
                      style={{
                        padding: '8px 16px',
                        background: '#fef3c7',
                        color: '#f59e0b',
                        border: '2px solid #f59e0b',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        transition: 'all 0.3s'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = '#fde68a'
                        e.target.style.transform = 'translateY(-1px)'
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = '#fef3c7'
                        e.target.style.transform = 'translateY(0)'
                      }}
                    >
                      🗑️ Clear Manual Review Cache
                    </button>
                    <button
                      onClick={() => {
                        setShowComparison(false)
                        setManualReviewFile(null)
                        setManualReviewContent('')
                        setManualReviewParsed([])
                      }}
                      style={{
                        padding: '8px 16px',
                        background: '#fef2f2',
                        color: '#ef4444',
                        border: '2px solid #ef4444',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        transition: 'all 0.3s'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = '#fecaca'
                        e.target.style.transform = 'translateY(-1px)'
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = '#fef2f2'
                        e.target.style.transform = 'translateY(0)'
                      }}
                    >
                      🔄 Upload Different Review
                    </button>
                  </div>
                </div>

                {/* Element-by-element comparison */}
                <div style={{ marginBottom: '30px' }}>
                  {(() => {
                    console.log('🔍 COMPARISON DEBUG:')
                    console.log('manualRules:', manualRules)
                    console.log('results:', results)
                    console.log('SECTIONS:', SECTIONS)
                    console.log('manualReviewContent length:', manualReviewContent?.length)
                    
                    if (!manualRules) {
                      console.log('❌ No manual rules found')
                      return (
                        <div style={{
                          padding: '40px',
                          textAlign: 'center',
                          background: '#fef3c7',
                          borderRadius: '12px',
                          border: '2px solid #f59e0b'
                        }}>
                          <div style={{ fontSize: '3rem', marginBottom: '15px' }}>⚠️</div>
                          <h3 style={{ color: '#f59e0b', marginBottom: '10px' }}>Manual Rules Not Loaded</h3>
                          <p style={{ color: '#92400e', fontSize: '0.9rem' }}>
                            Please upload and process the compliance manual first in the "1. Upload Manual" tab.
                          </p>
                        </div>
                      )
                    }
                    
                    if (!results) {
                      console.log('❌ No results found')
                      return (
                        <div style={{
                          padding: '40px',
                          textAlign: 'center',
                          background: '#fef3c7',
                          borderRadius: '12px',
                          border: '2px solid #f59e0b'
                        }}>
                          <div style={{ fontSize: '3rem', marginBottom: '15px' }}>⚠️</div>
                          <h3 style={{ color: '#f59e0b', marginBottom: '10px' }}>No Analysis Results</h3>
                          <p style={{ color: '#92400e', fontSize: '0.9rem' }}>
                            Please analyze an application first in the "2. Analyze Application" tab.
                          </p>
                        </div>
                      )
                    }
                    
                    console.log('✅ Both manualRules and results exist, rendering sections...')
                    
                    return SECTIONS.map((section, sectionIdx) => {
                      const result = results[section]
                      console.log(`Section ${sectionIdx}: ${section}`, 'result:', result)
                      
                      if (!result) {
                        console.log(`  ⚠️ No result for section: ${section}`)
                        return null
                      }
                      
                      // Match chapter - handle "Chapter X: Name" vs "Name" format
                      const chapter = manualRules?.find(ch => {
                        // Try exact match first
                        if (ch.chapter === section) return true
                        // Try section field match
                        if (ch.section === section) return true
                        // Try matching after "Chapter X: " prefix
                        if (ch.chapter?.includes(': ') && ch.chapter.split(': ')[1] === section) return true
                        return false
                      })
                      console.log(`  Chapter found:`, chapter)
                      
                      if (!chapter || !chapter.elements) {
                        console.log(`  ⚠️ No chapter or elements for: ${section}`)
                        return null
                      }
                      
                      console.log(`  ✅ Rendering ${chapter.elements.length} elements for: ${section}`)
                    
                    return (
                      <div key={sectionIdx} style={{
                        marginBottom: '30px',
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '2px solid #D9E8F6',
                        overflow: 'hidden'
                      }}>
                        {/* Chapter Header */}
                        <div style={{
                          padding: '15px 20px',
                          background: '#EFF6FB',
                          borderBottom: '2px solid #D9E8F6'
                        }}>
                          <h3 style={{
                            margin: 0,
                            color: '#0B4778',
                            fontSize: '1.1rem',
                            fontWeight: '600'
                          }}>
                            {section}
                          </h3>
                        </div>

                        {/* Elements Comparison */}
                        <div style={{ padding: '20px' }}>
                          {chapter.elements.map((element, elemIdx) => {
                            // Find validation result for this element
                            const validationResult = [...(result.compliantItems || []), ...(result.nonCompliantItems || []), ...(result.notApplicableItems || [])]
                              .find(item => {
                                if (!item.element || !element.element) return false
                                if (item.element === element.element) return true
                                if (item.element.includes(element.element.substring(0, 20))) return true
                                if (element.element.includes(item.element.substring(0, 20))) return true
                                const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim()
                                if (normalizeText(item.element) === normalizeText(element.element)) return true
                                return false
                              })
                            
                            if (!validationResult) return null
                            
                            const isCompliant = result.compliantItems?.some(item => {
                              if (!item.element || !element.element) return false
                              if (item.element === element.element) return true
                              if (item.element.includes(element.element.substring(0, 20))) return true
                              if (element.element.includes(item.element.substring(0, 20))) return true
                              const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim()
                              if (normalizeText(item.element) === normalizeText(element.element)) return true
                              return false
                            })
                            
                            const isNotApplicable = result.notApplicableItems?.some(item => {
                              if (!item.element || !element.element) return false
                              if (item.element === element.element) return true
                              if (item.element.includes(element.element.substring(0, 20))) return true
                              if (element.element.includes(item.element.substring(0, 20))) return true
                              const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim()
                              if (normalizeText(item.element) === normalizeText(element.element)) return true
                              return false
                            })
                            
                            // Search for this element in AI-parsed manual review data
                            const elementName = element.element || `Element ${elemIdx + 1}`
                            
                            let foundInManual = false
                            let manualExcerpt = ''
                            let manualComplianceStatus = null
                            let manualComments = ''
                            let selectedOptionFull = ''
                            
                            // Extract element letter from element name
                            const elementMatch = elementName.match(/Element\s+([a-z])/i)
                            const elementLetter = elementMatch?.[1]?.toLowerCase()
                            
                            if (elementLetter && manualReviewParsed && manualReviewParsed.length > 0) {
                              // Find element in AI-parsed data matching BOTH section and letter
                              const parsedElement = manualReviewParsed.find(item => {
                                const letterMatches = item.letter?.toLowerCase() === elementLetter
                                
                                // Check if section names match (allowing for variations)
                                const itemSection = item.section?.toLowerCase() || ''
                                const currentSection = section.toLowerCase()
                                
                                // Try exact match first
                                if (letterMatches && itemSection.includes(currentSection)) {
                                  return true
                                }
                                
                                // Try partial match (e.g., "Contracts" matches "Contracts and Subawards")
                                if (letterMatches) {
                                  const sectionWords = currentSection.split(/\s+/)
                                  const matches = sectionWords.some(word => 
                                    word.length > 3 && itemSection.includes(word)
                                  )
                                  if (matches) return true
                                }
                                
                                return false
                              })
                              
                              if (parsedElement) {
                                foundInManual = true
                                
                                // Map status from AI response
                                const status = parsedElement.status?.toLowerCase()
                                if (status?.includes('yes')) {
                                  manualComplianceStatus = 'compliance'
                                  selectedOptionFull = 'Yes, Organization demonstrates compliance based on the PAR review'
                                } else if (status?.includes('not applicable') || status?.includes('n/a')) {
                                  manualComplianceStatus = 'not-applicable'
                                  selectedOptionFull = 'Not Applicable'
                                } else if (status?.includes('no')) {
                                  manualComplianceStatus = 'non-compliance'
                                  selectedOptionFull = 'No, Organization does not demonstrate compliance based on the PAR review'
                                }
                                
                                // Get comments from AI response
                                manualComments = parsedElement.comments || ''
                              }
                            }
                            
                            return (
                              <div key={elemIdx} style={{
                                marginBottom: '20px',
                                border: `2px solid ${isNotApplicable ? '#64748b' : isCompliant ? '#10b981' : '#ef4444'}`,
                                borderRadius: '8px',
                                overflow: 'hidden'
                              }}>
                                {/* Element Header */}
                                <div style={{
                                  padding: '12px 15px',
                                  background: isNotApplicable ? '#f8fafc' : isCompliant ? '#f0fdf4' : '#fef2f2',
                                  borderBottom: `1px solid ${isNotApplicable ? '#64748b' : isCompliant ? '#10b981' : '#ef4444'}`
                                }}>
                                  <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }}>
                                    <strong style={{ color: '#0B4778', fontSize: '0.95rem' }}>
                                      {elementName}
                                    </strong>
                                    <span style={{
                                      padding: '4px 12px',
                                      background: isNotApplicable ? '#64748b' : isCompliant ? '#10b981' : '#ef4444',
                                      color: 'white',
                                      borderRadius: '4px',
                                      fontSize: '0.8rem',
                                      fontWeight: '600'
                                    }}>
                                      {isNotApplicable ? '⊘ NOT APPLICABLE' : isCompliant ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}
                                    </span>
                                  </div>
                                </div>

                                {/* Side-by-side comparison */}
                                <div style={{
                                  display: 'grid',
                                  gridTemplateColumns: '1fr 1fr',
                                  gap: '0'
                                }}>
                                  {/* Agent Analysis */}
                                  <div style={{
                                    padding: '15px',
                                    background: '#FFFFFF',
                                    borderRight: '1px solid #D9E8F6'
                                  }}>
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      marginBottom: '10px'
                                    }}>
                                      <span style={{ fontSize: '1.2rem' }}>🤖</span>
                                      <strong style={{ color: '#3b82f6', fontSize: '0.9rem' }}>
                                        Agent Analysis
                                      </strong>
                                    </div>
                                    <p style={{
                                      margin: '0 0 10px 0',
                                      color: '#64748b',
                                      fontSize: '0.85rem',
                                      lineHeight: '1.5'
                                    }}>
                                      {element.requirementText}
                                    </p>
                                    {validationResult.evidence && (
                                      <div style={{
                                        marginTop: '10px',
                                        padding: '10px',
                                        background: '#FFFFFF',
                                        borderRadius: '6px',
                                        border: '1px solid #D9E8F6'
                                      }}>
                                        <div style={{
                                          fontSize: '0.8rem',
                                          color: '#94a3b8',
                                          marginBottom: '5px',
                                          fontWeight: '600'
                                        }}>
                                          Evidence:
                                        </div>
                                        <div style={{
                                          fontSize: '0.8rem',
                                          color: '#1e3a5f',
                                          lineHeight: '1.5'
                                        }}>
                                          {(() => {
                                            const evidenceKey = `${section}-${elemIdx}-evidence`
                                            const isExpanded = expandedEvidence[evidenceKey]
                                            const shouldTruncate = validationResult.evidence.length > 200
                                            
                                            return (
                                              <>
                                                {isExpanded || !shouldTruncate 
                                                  ? validationResult.evidence 
                                                  : validationResult.evidence.substring(0, 200) + '...'}
                                                {shouldTruncate && (
                                                  <button
                                                    onClick={() => setExpandedEvidence(prev => ({
                                                      ...prev,
                                                      [evidenceKey]: !prev[evidenceKey]
                                                    }))}
                                                    style={{
                                                      marginLeft: '8px',
                                                      padding: '4px 8px',
                                                      background: '#3b82f6',
                                                      color: 'white',
                                                      border: 'none',
                                                      borderRadius: '4px',
                                                      cursor: 'pointer',
                                                      fontSize: '0.75rem',
                                                      fontWeight: '600',
                                                      transition: 'background 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => e.target.style.background = '#2563eb'}
                                                    onMouseLeave={(e) => e.target.style.background = '#3b82f6'}
                                                  >
                                                    {isExpanded ? '📖 Read Less' : '📖 Read More'}
                                                  </button>
                                                )}
                                              </>
                                            )
                                          })()}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Project Officer Review */}
                                  <div style={{
                                    padding: '15px',
                                    background: '#FFFFFF'
                                  }}>
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      marginBottom: '10px'
                                    }}>
                                      <span style={{ fontSize: '1.2rem' }}>👤</span>
                                      <strong style={{ color: '#10b981', fontSize: '0.9rem' }}>
                                        Project Officer Review
                                      </strong>
                                    </div>
                                    
                                    {foundInManual ? (
                                      <div>
                                        {/* Manual Compliance Status */}
                                        {manualComplianceStatus && (
                                          <div style={{
                                            padding: '8px 12px',
                                            background: manualComplianceStatus === 'compliance' ? '#d1fae5' : 
                                                       manualComplianceStatus === 'non-compliance' ? '#fef2f2' : '#fef3c7',
                                            borderRadius: '6px',
                                            border: `1px solid ${manualComplianceStatus === 'compliance' ? '#10b981' : 
                                                                 manualComplianceStatus === 'non-compliance' ? '#ef4444' : '#f59e0b'}`,
                                            marginBottom: '10px'
                                          }}>
                                            <div style={{
                                              fontSize: '0.8rem',
                                              color: manualComplianceStatus === 'compliance' ? '#059669' : 
                                                     manualComplianceStatus === 'non-compliance' ? '#ef4444' : '#f59e0b',
                                              fontWeight: '600',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '6px'
                                            }}>
                                              {manualComplianceStatus === 'compliance' ? (
                                                <>
                                                  <span>✅</span>
                                                  <span>Manual Review: COMPLIANCE (Yes)</span>
                                                </>
                                              ) : manualComplianceStatus === 'non-compliance' ? (
                                                <>
                                                  <span>❌</span>
                                                  <span>Manual Review: NON-COMPLIANCE (No)</span>
                                                </>
                                              ) : (
                                                <>
                                                  <span>⚪</span>
                                                  <span>Manual Review: NOT APPLICABLE</span>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                        
                                        {/* Manual Comments */}
                                        {manualComments && (
                                          <div style={{
                                            padding: '10px',
                                            background: '#FFFFFF',
                                            borderRadius: '6px',
                                            border: '1px solid #D9E8F6',
                                            marginBottom: '10px'
                                          }}>
                                            <div style={{
                                              fontSize: '0.75rem',
                                              color: '#64748b',
                                              marginBottom: '5px',
                                              fontWeight: '600',
                                              textTransform: 'uppercase'
                                            }}>
                                              Comments:
                                            </div>
                                            <div style={{
                                              fontSize: '0.8rem',
                                              color: '#1e3a5f',
                                              lineHeight: '1.5',
                                              fontStyle: 'italic'
                                            }}>
                                              {manualComments}
                                            </div>
                                          </div>
                                        )}
                                        
                                        {/* Selected Option */}
                                        {selectedOptionFull && (
                                          <div style={{
                                            padding: '10px',
                                            background: '#f0fdf4',
                                            borderRadius: '6px',
                                            border: '1px solid #10b981'
                                          }}>
                                            <div style={{
                                              fontSize: '0.75rem',
                                              color: '#059669',
                                              marginBottom: '5px',
                                              fontWeight: '600',
                                              textTransform: 'uppercase'
                                            }}>
                                              Selected Option:
                                            </div>
                                            <div style={{
                                              fontSize: '0.8rem',
                                              color: '#1e3a5f',
                                              lineHeight: '1.5'
                                            }}>
                                              {selectedOptionFull}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div style={{
                                        padding: '10px',
                                        background: '#fef3c7',
                                        borderRadius: '6px',
                                        border: '1px solid #f59e0b'
                                      }}>
                                        <div style={{
                                          fontSize: '0.8rem',
                                          color: '#f59e0b',
                                          fontWeight: '600',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px'
                                        }}>
                                          <span>⚠️</span>
                                          <span>Not Found in Manual Review</span>
                                        </div>
                                        <div style={{
                                          fontSize: '0.75rem',
                                          color: '#94a3b8',
                                          marginTop: '5px',
                                          fontStyle: 'italic'
                                        }}>
                                          This element was analyzed by AI but not found in the manual review document.
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                    })
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <h2 style={{ color: '#0B4778', marginBottom: '20px' }}>⚙️ Settings</h2>
            
            {/* Cache Management Section */}
            <div style={{
              background: '#FFFFFF',
              border: '2px solid #D9E8F6',
              borderRadius: '12px',
              padding: '25px',
              marginBottom: '30px'
            }}>
              <h3 style={{ color: '#0B4778', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>🗄️</span>
                <span>Cache Management</span>
              </h3>
              
              <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '0.9rem' }}>
                Manage cached analysis results and manual review data. Clearing cache will free up storage space.
              </p>
              
              {/* Cache Action Buttons */}
              <div style={{ marginBottom: '30px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                <button
                  onClick={async () => {
                    if (window.confirm('🔄 Remove duplicate cache files? This will keep only the most recent version of each application.')) {
                      try {
                        const response = await fetch(`${BACKEND_URL}/api/cache/remove-duplicates`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' }
                        })
                        const result = await response.json()
                        if (result.success) {
                          await loadCachedApplications()
                          alert(`✅ ${result.message}\n\nDeleted ${result.filesDeleted} duplicate files from ${result.duplicatesFound} applications.`)
                        } else {
                          alert('❌ Failed to remove duplicates: ' + result.error)
                        }
                      } catch (error) {
                        alert('❌ Failed to remove duplicates: ' + error.message)
                      }
                    }
                  }}
                  style={{
                    padding: '12px 24px',
                    background: '#fef3c7',
                    color: '#f59e0b',
                    border: '2px solid #f59e0b',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600',
                    transition: 'all 0.3s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={(e) => { e.target.style.background = '#fde047'; e.target.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.target.style.background = '#fef3c7'; e.target.style.transform = 'translateY(0)'; }}
                >
                  <span>🔄</span>
                  <span>Remove Duplicates</span>
                </button>
                
                <button
                  onClick={async () => {
                    if (window.confirm('⚠️ Are you sure you want to clear ALL caches? This will delete all cached analysis results and manual reviews.')) {
                      try {
                        await clearAllCaches()
                        await loadCachedApplications()
                        alert('✅ All caches cleared successfully!')
                      } catch (error) {
                        alert('❌ Failed to clear caches: ' + error.message)
                      }
                    }
                  }}
                  style={{
                    padding: '12px 24px',
                    background: '#fef2f2',
                    color: '#ef4444',
                    border: '2px solid #ef4444',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600',
                    transition: 'all 0.3s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={(e) => { e.target.style.background = '#fee2e2'; e.target.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.target.style.background = '#fef2f2'; e.target.style.transform = 'translateY(0)'; }}
                >
                  <span>🗑️</span>
                  <span>Clear All Caches</span>
                </button>
              </div>
              
              {/* Search and Clear Individual Applications */}
              <div>
                <h4 style={{ color: '#0B4778', marginBottom: '15px', fontSize: '1.1rem' }}>
                  Cached Applications
                </h4>
                
                {/* Search Bar */}
                <div style={{ marginBottom: '20px' }}>
                  <input
                    type="text"
                    placeholder="🔍 Search cached applications..."
                    value={settingsSearchQuery}
                    onChange={(e) => setSettingsSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 20px',
                      fontSize: '1rem',
                      background: '#EFF6FB',
                      border: '2px solid #D9E8F6',
                      borderRadius: '8px',
                      color: '#0B4778',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#D9E8F6'}
                  />
                </div>
                
                {/* Cached Applications List */}
                {cachedApplications.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    background: '#EFF6FB',
                    borderRadius: '8px',
                    border: '2px dashed #D9E8F6'
                  }}>
                    <div style={{ fontSize: '3rem', marginBottom: '15px' }}>📂</div>
                    <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
                      No cached applications found
                    </p>
                  </div>
                ) : (
                  <div style={{
                    background: '#EFF6FB',
                    borderRadius: '8px',
                    border: '1px solid #D9E8F6',
                    overflow: 'hidden'
                  }}>
                    {(() => {
                      // Remove duplicates by application number, keeping the most recent one
                      const uniqueAppsMap = new Map();
                      cachedApplications.forEach(app => {
                        const appNum = app.applicationNumber;
                        if (!appNum) {
                          uniqueAppsMap.set(app.cacheKey, app);
                        } else {
                          const existing = uniqueAppsMap.get(appNum);
                          if (!existing || new Date(app.timestamp) > new Date(existing.timestamp)) {
                            uniqueAppsMap.set(appNum, app);
                          }
                        }
                      });
                      
                      return Array.from(uniqueAppsMap.values())
                        .filter(app => 
                          !settingsSearchQuery || 
                          app.applicationName?.toLowerCase().includes(settingsSearchQuery.toLowerCase()) ||
                          app.applicationNumber?.toLowerCase().includes(settingsSearchQuery.toLowerCase()) ||
                          app.cacheKey?.toLowerCase().includes(settingsSearchQuery.toLowerCase())
                        )
                        .map((app, index) => (
                        <div
                          key={index}
                          style={{
                            padding: '15px 20px',
                            borderBottom: index < cachedApplications.length - 1 ? '1px solid #D9E8F6' : 'none',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{
                              color: '#0B4778',
                              fontSize: '1rem',
                              fontWeight: '600',
                              marginBottom: '5px'
                            }}>
                              {app.applicationName || 'Unnamed Application'}
                            </div>
                            <div style={{
                              color: '#64748b',
                              fontSize: '0.85rem',
                              display: 'flex',
                              gap: '15px',
                              flexWrap: 'wrap'
                            }}>
                              <span>📅 {new Date(app.timestamp).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}</span>
                              <span style={{ fontFamily: 'monospace' }}>
                                🔑 {app.cacheKey.substring(0, 16)}...
                              </span>
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                              onClick={() => viewCachedApplication(app.cacheKey)}
                              style={{
                                padding: '8px 16px',
                                background: '#EFF6FB',
                                color: '#3b82f6',
                                border: '2px solid #3b82f6',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: '600',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => { e.target.style.background = '#dbeafe'; e.target.style.transform = 'translateY(-1px)'; }}
                              onMouseLeave={(e) => { e.target.style.background = '#EFF6FB'; e.target.style.transform = 'translateY(0)'; }}
                            >
                              👁️ View
                            </button>
                            <button
                              onClick={async () => {
                                if (window.confirm(`Delete cached analysis for "${app.applicationName || 'this application'}"?`)) {
                                  try {
                                    await axios.delete(`${BACKEND_URL}/api/cache/delete`, {
                                      data: {
                                        fileHash: app.fileHash,
                                        manualVersion: app.manualVersion
                                      }
                                    })
                                    await loadCachedApplications()
                                    alert('✅ Cache deleted successfully!')
                                  } catch (error) {
                                    alert('❌ Failed to delete cache: ' + error.message)
                                  }
                                }
                              }}
                              style={{
                                padding: '8px 16px',
                                background: '#fef2f2',
                                color: '#ef4444',
                                border: '2px solid #ef4444',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: '600',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => { e.target.style.background = '#fee2e2'; e.target.style.transform = 'translateY(-1px)'; }}
                              onMouseLeave={(e) => { e.target.style.background = '#fef2f2'; e.target.style.transform = 'translateY(0)'; }}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      ))})()}
                    
                    {/* No Search Results */}
                    {settingsSearchQuery && 
                     cachedApplications.filter(app => 
                       app.applicationName?.toLowerCase().includes(settingsSearchQuery.toLowerCase()) ||
                       app.cacheKey?.toLowerCase().includes(settingsSearchQuery.toLowerCase())
                     ).length === 0 && (
                      <div style={{
                        textAlign: 'center',
                        padding: '30px 20px',
                        color: '#64748b'
                      }}>
                        <div style={{ fontSize: '2rem', marginBottom: '10px' }}>🔍</div>
                        <p style={{ fontSize: '0.9rem' }}>
                          No applications match "{settingsSearchQuery}"
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Cache Status Display */}
            {cacheStatus && (
              <div style={{
                padding: '15px 20px',
                background: '#f0fdf4',
                border: '2px solid #10b981',
                borderRadius: '8px',
                color: '#059669',
                fontSize: '0.95rem',
                textAlign: 'center',
                fontWeight: '600'
              }}>
                {cacheStatus}
              </div>
            )}
          </div>
        )}

        {status && (
          <div className={`status ${processing ? 'processing' : status.includes('✅') ? 'success' : status.includes('❌') ? 'error' : 'processing'}`}>
            {processing && <div className="spinner"></div>}
            {status}
          </div>
        )}
      </div>

    </div>
  )
}

export default App
