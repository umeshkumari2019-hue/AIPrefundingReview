import { useState, useEffect } from 'react'
import axios from 'axios'
import * as XLSX from 'xlsx'
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer, Table, TableCell, TableRow, WidthType, BorderStyle } from 'docx'
import { saveAs } from 'file-saver'

// Azure Document Intelligence configuration
const AZURE_DOC_ENDPOINT = import.meta.env.VITE_AZURE_DOC_ENDPOINT || ''
const AZURE_DOC_KEY = import.meta.env.VITE_AZURE_DOC_KEY || ''

// Azure OpenAI configuration
const AZURE_OPENAI_ENDPOINT = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT || ''
const AZURE_OPENAI_KEY = import.meta.env.VITE_AZURE_OPENAI_KEY || ''
const AZURE_OPENAI_DEPLOYMENT = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT || ''

// Backend server configuration
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''

const SECTIONS = [
 'Needs Assessment',
   'Sliding Fee Discount Program',
   'Key Management Staff',
   'Contracts and Subawards',
  'Collaborative Relationships',
  'Billing and Collections',
   'Budget',
   'Board Authority',
   'Board Composition'
]

function App() {
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
  const [speechStatus, setSpeechStatus] = useState({}) // Track speech status for each item
  const [cachedApplications, setCachedApplications] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [manualReviewFile, setManualReviewFile] = useState(null)
  const [manualReviewContent, setManualReviewContent] = useState('')
  const [manualReviewParsed, setManualReviewParsed] = useState([])
  const [showComparison, setShowComparison] = useState(false)

  // Load saved compliance rules from JSON file on mount
  useEffect(() => {
    loadSavedRules()
    loadCachedApplications()
  }, [])

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

  const loadSavedRules = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/load-rules`)
      if (response.data.success) {
        setManualRules(response.data.rules)
        setStatus('✅ Loaded saved compliance rules from file')
        console.log('Loaded rules from file:', response.data.rules.length, 'chapters')
      }
    } catch (error) {
      console.log('No saved rules found or backend not running')
    }
  }

  const loadCachedApplications = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/cache/list`)
      if (response.data.success) {
        // Sort by timestamp descending (most recent first) and take top 5
        const sortedCaches = response.data.caches.sort((a, b) => 
          new Date(b.timestamp) - new Date(a.timestamp)
        ).slice(0, 5)
        setCachedApplications(sortedCaches)
        console.log('Loaded top 5 cached applications:', sortedCaches.length)
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
        setApplicationName(cacheData.applicationName)
        setResults(cacheData.results)
        setActiveTab('results')
      }
    } catch (error) {
      console.error('Error loading cached application:', error)
      alert('Failed to load application')
    }
  }

  const saveRulesToFile = async (rules) => {
    try {
      const response = await axios.post('http://localhost:3001/api/save-rules', { rules })
      if (response.data.success) {
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
          text: `HRSA Compliance Analysis Report`,
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
                new TextRun({ text: `Evidence Location: `, bold: true }),
                new TextRun({ text: item.evidenceLocation || 'Not specified' })
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
      const filename = `Compliance_Report_${applicationName || 'Report'}_${timestamp}.docx`
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
      'AI Analysis - Status',
      'AI Analysis - Evidence',
      'AI Analysis - Reasoning',
      'Manual Review - Status',
      'Manual Review - Comments',
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
        const validationResult = [...(result.compliantItems || []), ...(result.nonCompliantItems || [])]
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
              manualStatus = 'COMPLIANCE (Yes)'
            } else if (status?.includes('not applicable') || status?.includes('n/a')) {
              manualStatus = 'NOT APPLICABLE'
            } else if (status?.includes('no')) {
              manualStatus = 'NON-COMPLIANCE (No)'
            }
            manualComments = parsedElement.comments || ''

            // Determine match status
            const aiCompliant = isCompliant
            const manualCompliant = status?.includes('yes')
            
            if (aiCompliant === manualCompliant) {
              matchStatus = '✓ Match'
            } else {
              matchStatus = '✗ Mismatch'
            }
          }
        }

        // Add row to export data
        exportData.push([
          section,
          elementName,
          isCompliant ? 'COMPLIANCE' : 'NON-COMPLIANCE',
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

- Chapter 3: Needs Assessment
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
"Chapter 3: Needs Assessment
Authority: Section 330(k)(2) and Section 330(k)(3)(J) of the PHS Act; and 42 CFR 51c.104(b)(2-3)...
Element b - Update of Needs Assessment
The health center completes or updates a needs assessment of the current or proposed population at least once every three years...
Factors associated with access to care... :unselected: The most significant causes of morbidity... :unselected: Any other unique health care needs...
Section of the Application to review Project Narrative - Need section, items 2a - c
Items 2a - c within the Application
Describe your process for assessing the needs...
a) How often you conduct or update the needs assessment.
b) How you use the results to inform and improve service delivery.
c) Using the most recently available data...
NOTE: Select 'N/A' if Form 8 indicates that the applicant does not have any subawards."

Extract into this JSON structure (ONE object per chapter with ALL elements grouped inside):
{
  "requirements": [
    {
      "chapter": "Chapter 3: Needs Assessment",
      "section": "Needs Assessment",
      "authority": "Full authority text from the document",
      "elements": [
        {
          "element": "Element b - Update of Needs Assessment",
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

CRITICAL: Return exactly 9 objects in the requirements array - one for each chapter. Group ALL elements found in each chapter together.

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
  const retryWithBackoff = async (fn, maxRetries = 3, initialDelay = 20000) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        const isRateLimitError = error.response?.data?.error?.code === 'RateLimitReached'
        
        if (isRateLimitError && attempt < maxRetries - 1) {
          const delay = initialDelay * Math.pow(2, attempt) // Exponential backoff: 20s, 40s, 80s
          console.log(`Rate limit hit. Retrying in ${delay/1000} seconds... (Attempt ${attempt + 1}/${maxRetries})`)
          setStatus(`⚠️ Rate limit reached. Retrying in ${delay/1000} seconds... (Attempt ${attempt + 1}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, delay))
        } else {
          throw error
        }
      }
    }
  }

  // Azure OpenAI - Validate compliance
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

🚨 FIRST PRIORITY - CHECK FOR N/A CONDITIONS:
- BEFORE evaluating compliance, read the "IMPORTANT NOTES AND GUIDANCE" section above
- If the NOTES contain text like "Select 'N/A' if..." or "NOTE: Select 'N/A' if...", this is a N/A CONDITION
- Check if the N/A condition applies to this application:
  * Example: NOTE says "Select 'N/A' if Form 8 indicates no subawards" → Check Form 8 for Q2 answer
  * If Form 8 shows Q2='NO' or '0' contracts/subawards → N/A condition is MET
  * If N/A condition is MET → IMMEDIATELY return status: "NOT_APPLICABLE" (do NOT evaluate for compliance)
  * In reasoning, state: "Not Applicable - [explain why N/A condition is met based on NOTE]"
- CRITICAL: If you determine the requirement is "not applicable" in your reasoning, you MUST set status to "NOT_APPLICABLE", NOT "NON_COMPLIANT"

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
  "evidenceSection": "The section heading, title, or context from the PDF where evidence was found (e.g., 'Section 3: Community Health Needs Assessment' or 'Attachment B: Service Delivery Plan' or 'Not found')",
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
    if (!manualFile) return

    setProcessing(true)
    setStatus('Extracting text from compliance manual...')

    try {
      const content = await extractTextFromPDF(manualFile)
      setStatus('Analyzing compliance requirements with AI...')
      
      const rules = await extractComplianceRules(content)
      setManualRules(rules)
      
      // Save to file via backend
      setStatus('Saving rules to file...')
      await saveRulesToFile(rules)
      
      setStatus(`✅ Success! Extracted ${rules.length} compliance requirements. Rules saved to data/compliance-rules.json`)
      setActiveTab('analyze')
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`)
    } finally {
      setProcessing(false)
    }
  }

  // Handle application analysis
  const handleApplicationAnalysis = async () => {
    if (!applicationFile || !manualRules) return

    setProcessing(true)
    setStatus('Generating file hash...')

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
        setCacheStatus(`✅ Loaded from cache (analyzed on ${new Date(cachedData.timestamp).toLocaleString()})`)
        setResults(cachedData.results)
        setStatus(`✅ Analysis loaded from cache! (Original analysis: ${new Date(cachedData.timestamp).toLocaleString()})`)
        setActiveTab('results')
        setProcessing(false)
        return
      }
      
      // Cache miss - proceed with full analysis
      setCacheStatus('🔄 No cache found - running full analysis...')
      setStatus('Extracting text from application...')
      const content = await extractTextFromPDF(applicationFile)
      setStatus('Analyzing compliance for each section...')
      
      const sectionResults = {}
      
      for (let i = 0; i < SECTIONS.length; i++) {
        const section = SECTIONS[i]
        setStatus(`Analyzing ${section} (${i + 1}/${SECTIONS.length})...`)
        
        // Use retry logic for validation
        const result = await retryWithBackoff(() => validateCompliance(section, manualRules, content))
        sectionResults[section] = result
        
        // Add delay between API calls to avoid rate limits (except after last section)
        if (i < SECTIONS.length - 1) {
          setStatus(`⏳ Waiting 20 seconds to avoid rate limits... (${i + 1}/${SECTIONS.length} completed)`)
          await new Promise(resolve => setTimeout(resolve, 20000)) // 20 second delay
        }
      }
      
      // Save results to cache
      setStatus('💾 Saving results to cache...')
      await saveToCache(fileHash, manualVersion, {
        applicationName,
        extractedContent: content,
        results: sectionResults
      })
      
      setResults(sectionResults)
      setCacheStatus('✅ Analysis complete and cached!')
      setStatus('✅ Analysis complete!')
      setActiveTab('results')
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`)
      setCacheStatus('')
    } finally {
      setProcessing(false)
    }
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

  return (
    <div className="container">
      <div className="header">
        <h1>📋 HRSA Compliance System</h1>
        <p>AI-Powered Document Intelligence for Health Center Compliance</p>
      </div>

      <div className="card">
        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 Dashboard
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
            🔍 Compare with Manual
          </button>
        </div>

        {activeTab === 'dashboard' && (
          <div>
            <h2 style={{ color: '#f1f5f9', marginBottom: '20px' }}>📊 Dashboard - Analyzed Applications</h2>
            
            {/* Search Bar */}
            <div style={{ marginBottom: '30px' }}>
              <input
                type="text"
                placeholder="🔍 Search by application name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  fontSize: '1rem',
                  background: '#1e293b',
                  border: '2px solid #475569',
                  borderRadius: '8px',
                  color: '#f1f5f9',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#475569'}
              />
            </div>

            {/* Applications Grid */}
            {cachedApplications.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                background: '#1e293b',
                borderRadius: '12px',
                border: '2px dashed #475569'
              }}>
                <div style={{ fontSize: '4rem', marginBottom: '20px' }}>📂</div>
                <h3 style={{ color: '#94a3b8', marginBottom: '10px' }}>No Analyzed Applications Yet</h3>
                <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
                  Upload and analyze your first application to see it here
                </p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '20px'
              }}>
                {cachedApplications
                  .filter(app => 
                    !searchQuery || 
                    app.applicationName?.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((app, index) => (
                    <div
                      key={index}
                      style={{
                        background: '#1e293b',
                        border: '2px solid #334155',
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
                        e.currentTarget.style.borderColor = '#334155'
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      <div style={{ marginBottom: '15px' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '10px' }}>📄</div>
                        <h3 style={{
                          color: '#f1f5f9',
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
                          color: '#94a3b8',
                          fontSize: '0.85rem',
                          marginBottom: '5px'
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
                          color: '#64748b',
                          fontSize: '0.8rem',
                          fontFamily: 'monospace'
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
                        👁️ View Results
                      </button>
                    </div>
                  ))}
              </div>
            )}

            {/* No Search Results */}
            {cachedApplications.length > 0 && 
             searchQuery && 
             cachedApplications.filter(app => 
               app.applicationName?.toLowerCase().includes(searchQuery.toLowerCase())
             ).length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                background: '#1e293b',
                borderRadius: '12px',
                border: '2px solid #475569',
                marginTop: '20px'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '15px' }}>🔍</div>
                <h3 style={{ color: '#94a3b8', marginBottom: '8px' }}>No Results Found</h3>
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
                <h2>Upload HRSA Compliance Manual</h2>
                <div 
                  className="upload-section"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, setManualFile)}
                  onClick={() => document.getElementById('manual-input').click()}
                >
                  <div className="upload-icon">📄</div>
                  <h3>{manualFile ? manualFile.name : 'Drop PDF here or click to upload'}</h3>
                  <p>HRSA Compliance Manual PDF</p>
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
                  disabled={!manualFile || processing}
                >
                  {processing ? 'Processing...' : 'Extract Compliance Rules'}
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 style={{ color: '#f1f5f9' }}>✅ Compliance Rules Loaded ({manualRules.length} Chapters)</h2>
                  <button 
                    className="btn" 
                    onClick={() => {
                      setManualRules(null)
                      setManualFile(null)
                      setResults(null)
                      setStatus('Upload a new compliance manual to extract rules (previous rules will be overwritten)')
                    }}
                    style={{ background: '#f59e0b', fontSize: '0.9rem', padding: '8px 16px' }}
                  >
                    📤 Upload New Manual
                  </button>
                </div>
              </>
            )}

            {manualRules && manualRules.length > 0 && (
              <div className="results" style={{ marginTop: '30px' }}>
                <h2 style={{ color: '#f1f5f9' }}>✅ Extracted Compliance Requirements ({manualRules.length} Chapters)</h2>
                <p style={{ marginBottom: '20px', color: '#94a3b8' }}>
                  The following compliance chapters were extracted from the HRSA Compliance Manual and will be used to validate applications:
                </p>
                
                {manualRules.map((chapter, chapterIdx) => {
                  const uploadChapterKey = `upload-chapter-${chapterIdx}`
                  const isUploadChapterExpanded = expandedDetails[uploadChapterKey] || false
                  
                  return (
                  <div key={chapterIdx} className="section" style={{ marginBottom: '30px', border: '1px solid #334155', borderRadius: '8px', padding: '20px', background: '#1e293b' }}>
                    <button
                      onClick={() => setExpandedDetails(prev => ({...prev, [uploadChapterKey]: !isUploadChapterExpanded}))}
                      style={{
                        width: '100%',
                        padding: '15px 20px',
                        background: '#0f172a',
                        border: '1px solid #475569',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.3s',
                        marginBottom: isUploadChapterExpanded ? '15px' : '0'
                      }}
                    >
                      <h3 style={{ color: '#e0e7ff', margin: '0', fontSize: '1.2rem', fontWeight: '600' }}>
                        📋 {chapter.chapter || chapter.section}
                      </h3>
                      <span style={{ fontSize: '1.5rem', transition: 'transform 0.3s', transform: isUploadChapterExpanded ? 'rotate(180deg)' : 'rotate(0deg)', color: '#93c5fd' }}>
                        ▼
                      </span>
                    </button>
                    
                    {isUploadChapterExpanded && chapter.authority && (
                      <div style={{ marginBottom: '20px', padding: '12px', background: '#0f172a', borderRadius: '6px', border: '1px solid #334155' }}>
                        <strong style={{ color: '#f1f5f9' }}>📜 Authority:</strong>
                        <p style={{ margin: '5px 0 0 0', fontSize: '0.9rem', color: '#cbd5e1' }}>
                          {chapter.authority}
                        </p>
                      </div>
                    )}
                    
                    {isUploadChapterExpanded && chapter.elements && chapter.elements.length > 0 && (
                      <div>
                        <h4 style={{ marginBottom: '15px', color: '#94a3b8' }}>
                          Elements ({chapter.elements.length} requirements):
                        </h4>
                        {chapter.elements.map((element, elemIdx) => (
                          <div key={elemIdx} className="item" style={{ borderLeft: '4px solid #3b82f6', padding: '15px', marginBottom: '15px', background: '#0f172a', borderRadius: '4px', border: '1px solid #334155' }}>
                            <div style={{ marginBottom: '12px' }}>
                              <strong style={{ color: '#3b82f6', fontSize: '1.05rem' }}>
                                {element.element || `Element ${elemIdx + 1}`}
                              </strong>
                            </div>
                            
                            <div style={{ marginBottom: '12px' }}>
                              <strong style={{ color: '#f1f5f9' }}>📝 Requirement:</strong>
                              <p style={{ margin: '5px 0 0 0', lineHeight: '1.6', color: '#cbd5e1' }}>
                                {element.requirementText}
                              </p>
                            </div>
                            
                            {element.requirementDetails && element.requirementDetails.length > 0 && (
                              <div style={{ marginBottom: '12px', padding: '12px', background: '#1e293b', borderRadius: '6px', border: '1px solid #475569' }}>
                                <strong style={{ color: '#f1f5f9' }}>📋 Must Address:</strong>
                                <ul style={{ margin: '8px 0 0 20px', lineHeight: '1.8' }}>
                                  {element.requirementDetails.map((detail, i) => (
                                    <li key={i} style={{ fontSize: '0.95rem', color: '#cbd5e1', marginBottom: '8px' }}>{detail}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {element.applicationSection && (
                              <div style={{ marginBottom: '12px', padding: '10px', background: '#422006', borderRadius: '6px', border: '1px solid #78350f' }}>
                                <strong style={{ color: '#fbbf24' }}>🔍 Application Section to Review:</strong>
                                <p style={{ margin: '5px 0 0 0', fontSize: '0.9rem', color: '#fbbf24' }}>
                                  {element.applicationSection}
                                </p>
                              </div>
                            )}
                            
                            {element.applicationItems && element.applicationItems.length > 0 && (
                              <div style={{ marginTop: '12px' }}>
                                <strong style={{ color: '#f1f5f9' }}>✓ Items to Check:</strong>
                                <ul style={{ margin: '8px 0 0 20px', lineHeight: '1.8' }}>
                                  {element.applicationItems.map((item, i) => (
                                    <li key={i} style={{ fontSize: '0.95rem', color: '#cbd5e1' }}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {element.footnotes && (
                              <div style={{ marginTop: '12px', padding: '10px', background: '#422006', borderLeft: '3px solid #f59e0b', fontSize: '0.85rem', color: '#fbbf24', border: '1px solid #78350f', borderRadius: '6px' }}>
                                <strong>ℹ️ Note:</strong> {element.footnotes}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'analyze' && (
          <div>
            <h2 style={{ color: '#f1f5f9' }}>Analyze Health Center Application</h2>
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
              <h3>{applicationFile ? applicationFile.name : 'Drop PDF here or click to upload'}</h3>
              <p>Health Center Application PDF</p>
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
            
            {cacheStatus && (
              <div style={{ marginTop: '20px', padding: '12px', background: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#93c5fd', textAlign: 'center' }}>
                {cacheStatus}
              </div>
            )}
            
            <div style={{ marginTop: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button 
                onClick={clearAllCaches}
                style={{
                  padding: '10px 20px',
                  background: '#7f1d1d',
                  color: '#fca5a5',
                  border: '1px solid #991b1b',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                🗑️ Clear All Cached Analyses
              </button>
              <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                Clear cached results to force re-analysis
              </span>
            </div>
          </div>
        )}

        {activeTab === 'results' && results && (
          <div className="results">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
              <h2 style={{ margin: 0, color: '#f1f5f9' }}>📊 Compliance Results: {applicationName}</h2>
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
                    background: '#1e293b', 
                    border: '2px solid #475569', 
                    borderRadius: '12px', 
                    padding: '20px', 
                    textAlign: 'center' 
                  }}>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#93c5fd', marginBottom: '8px' }}>
                      {totalItems}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#cbd5e1', fontWeight: '500' }}>
                      Total Requirements
                    </div>
                  </div>
                  
                  {/* Compliant Items */}
                  <div 
                    onClick={() => handleSummaryCardClick('compliance')}
                    style={{ 
                      background: '#064e3b', 
                      border: '2px solid #10b981', 
                      borderRadius: '12px', 
                      padding: '20px', 
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-5px)'
                      e.currentTarget.style.boxShadow = '0 10px 25px rgba(16, 185, 129, 0.3)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#34d399', marginBottom: '8px' }}>
                      {totalCompliant}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#d1fae5', fontWeight: '500' }}>
                      ✅ Compliance
                    </div>
                  </div>
                  
                  {/* Non-Compliant Items */}
                  <div 
                    onClick={() => handleSummaryCardClick('non-compliance')}
                    style={{ 
                      background: '#7f1d1d', 
                      border: '2px solid #ef4444', 
                      borderRadius: '12px', 
                      padding: '20px', 
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-5px)'
                      e.currentTarget.style.boxShadow = '0 10px 25px rgba(239, 68, 68, 0.3)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#fca5a5', marginBottom: '8px' }}>
                      {totalNonCompliant}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#fecaca', fontWeight: '500' }}>
                      ❌ Non Compliance
                    </div>
                  </div>
                  
                  {/* Not Applicable Items */}
                  <div 
                    onClick={() => handleSummaryCardClick('not-applicable')}
                    style={{ 
                      background: '#334155', 
                      border: '2px solid #64748b', 
                      borderRadius: '12px', 
                      padding: '20px', 
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-5px)'
                      e.currentTarget.style.boxShadow = '0 10px 25px rgba(100, 116, 139, 0.3)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#94a3b8', marginBottom: '8px' }}>
                      {totalNotApplicable}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#cbd5e1', fontWeight: '500' }}>
                      ⊘ Not Applicable
                    </div>
                  </div>
                  
                  {/* Compliance Rate */}
                  <div style={{ 
                    background: '#1e293b', 
                    border: `2px solid ${complianceRate >= 80 ? '#10b981' : complianceRate >= 50 ? '#f59e0b' : '#ef4444'}`, 
                    borderRadius: '12px', 
                    padding: '20px', 
                    textAlign: 'center' 
                  }}>
                    <div style={{ 
                      fontSize: '2.5rem', 
                      fontWeight: 'bold', 
                      color: complianceRate >= 80 ? '#34d399' : complianceRate >= 50 ? '#fbbf24' : '#fca5a5',
                      marginBottom: '8px' 
                    }}>
                      {complianceRate}%
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#cbd5e1', fontWeight: '500' }}>
                      Compliance Rate
                    </div>
                  </div>
                </div>
              )
            })()}
            
            {SECTIONS.map(section => {
              const result = results[section]
              if (!result) return null

              // Find the chapter from manualRules
              const chapter = manualRules.find(r => r.section === section || section.includes(r.section) || r.section.includes(section))
              if (!chapter) return null

              const chapterKey = `chapter-${section}`
              const isChapterExpanded = expandedDetails[chapterKey] || false

              return (
                <div key={section} style={{ marginBottom: '40px', border: '1px solid #334155', borderRadius: '12px', padding: '20px', background: '#1e293b' }}>
                  <button
                    onClick={() => setExpandedDetails(prev => ({...prev, [chapterKey]: !isChapterExpanded}))}
                    style={{
                      width: '100%',
                      padding: '15px 20px',
                      background: '#0f172a',
                      border: '1px solid #475569',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'all 0.3s'
                    }}
                  >
                    <h3 style={{ color: '#e0e7ff', margin: '0', fontSize: '1.4rem', fontWeight: '600' }}>
                      📋 {chapter.chapter || chapter.section}
                    </h3>
                    <span style={{ fontSize: '1.5rem', transition: 'transform 0.3s', transform: isChapterExpanded ? 'rotate(180deg)' : 'rotate(0deg)', color: '#93c5fd' }}>
                      ▼
                    </span>
                  </button>
                  
                  {isChapterExpanded && chapter.elements && chapter.elements.map((element, elemIdx) => {
                    // Find validation result for this element
                    const allItems = [...result.compliantItems, ...result.nonCompliantItems, ...(result.notApplicableItems || [])]
                    const validationResult = allItems.find(item => {
                      if (!item.element || !element.element) return false
                      // Try exact match first
                      if (item.element === element.element) return true
                      // Try partial match (first 20 chars)
                      if (item.element.includes(element.element.substring(0, 20))) return true
                      if (element.element.includes(item.element.substring(0, 20))) return true
                      // Try normalized comparison (remove extra spaces, case insensitive)
                      const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim()
                      if (normalizeText(item.element) === normalizeText(element.element)) return true
                      // Try matching on "Element X" pattern
                      const elementPattern = /element\s+[a-z]/i
                      const itemMatch = item.element.match(elementPattern)
                      const elemMatch = element.element.match(elementPattern)
                      if (itemMatch && elemMatch && itemMatch[0].toLowerCase() === elemMatch[0].toLowerCase()) return true
                      return false
                    })
                    
                    const isCompliant = result.compliantItems.some(item => {
                      if (!item.element || !element.element) return false
                      if (item.element === element.element) return true
                      if (item.element.includes(element.element.substring(0, 20))) return true
                      if (element.element.includes(item.element.substring(0, 20))) return true
                      const normalizeText = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim()
                      if (normalizeText(item.element) === normalizeText(element.element)) return true
                      const elementPattern = /element\s+[a-z]/i
                      const itemMatch = item.element.match(elementPattern)
                      const elemMatch = element.element.match(elementPattern)
                      if (itemMatch && elemMatch && itemMatch[0].toLowerCase() === elemMatch[0].toLowerCase()) return true
                      return false
                    })
                    
                    const detailKey = `${section}-${elemIdx}`
                    const showDetails = expandedDetails[detailKey] || false
                    
                    // Check if this is a NOT_APPLICABLE status
                    const isNotApplicable = validationResult && validationResult.status === 'NOT_APPLICABLE'
                    
                    // Generate unique ID for navigation
                    const itemType = isNotApplicable ? 'not-applicable' : (isCompliant ? 'compliance' : 'non-compliance')
                    const itemId = `${section}-${itemType}-${elemIdx}`
                    const isHighlighted = highlightedItemId === itemId
                    
                    // Determine border and badge colors
                    const borderColor = isNotApplicable ? '#64748b' : (isCompliant ? '#10b981' : '#ef4444')
                    const badgeColor = isNotApplicable ? '#64748b' : (isCompliant ? '#10b981' : '#ef4444')
                    const badgeText = isNotApplicable ? '⊘ NOT APPLICABLE' : (isCompliant ? '✅ COMPLIANCE' : '❌ NON COMPLIANCE')
                    
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
                          background: isHighlighted ? '#1e3a5f' : '#0f172a',
                          boxShadow: isHighlighted ? '0 0 20px rgba(59, 130, 246, 0.5)' : 'none',
                          transition: 'all 0.3s ease'
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                          <div style={{ flex: 1 }}>
                            <strong style={{ color: '#f1f5f9', fontSize: '1.1rem', display: 'block', marginBottom: '8px' }}>
                              {element.element || `Element ${elemIdx + 1}`}
                            </strong>
                            <p style={{ margin: '0', color: '#cbd5e1', lineHeight: '1.6', fontSize: '0.95rem' }}>
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
                                background: '#1e293b',
                                border: '1px solid #475569',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '0.95rem',
                                fontWeight: '600',
                                color: '#f1f5f9',
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
                                background: '#0f172a', 
                                borderRadius: '8px', 
                                border: '1px solid #334155',
                                animation: 'slideDown 0.3s ease-out'
                              }}>
                                <ul style={{ margin: '0', paddingLeft: '20px', lineHeight: '1.8' }}>
                                  {element.requirementDetails.map((detail, i) => (
                                    <li key={i} style={{ fontSize: '0.9rem', color: '#cbd5e1', marginBottom: '6px' }}>{detail}</li>
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
                                  background: '#1e293b',
                                  border: '1px solid #475569',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  fontSize: '0.95rem',
                                  fontWeight: '600',
                                  color: '#f1f5f9',
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
                                background: '#1e293b',
                                borderRadius: '8px',
                                border: '1px solid #334155',
                                animation: 'slideDown 0.3s ease-out'
                              }}>
                                {/* Authority */}
                                {chapter.authority && (
                                  <div style={{ marginBottom: '20px' }}>
                                    <strong style={{ color: '#f59e0b', display: 'block', marginBottom: '8px', fontSize: '0.95rem' }}>
                                      ⚖️ Legal Authority:
                                    </strong>
                                    <div style={{ 
                                      padding: '12px', 
                                      background: '#0f172a', 
                                      borderRadius: '6px',
                                      borderLeft: '4px solid #f59e0b'
                                    }}>
                                      <p style={{ margin: '0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6' }}>
                                        {chapter.authority}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Application Section */}
                                {element.applicationSection && (
                                  <div style={{ marginBottom: '20px' }}>
                                    <strong style={{ color: '#8b5cf6', display: 'block', marginBottom: '8px', fontSize: '0.95rem' }}>
                                      📂 Where to Review:
                                    </strong>
                                    <div style={{ 
                                      padding: '12px', 
                                      background: '#0f172a', 
                                      borderRadius: '6px',
                                      borderLeft: '4px solid #8b5cf6'
                                    }}>
                                      <p style={{ margin: '0', fontSize: '0.85rem', color: '#cbd5e1' }}>
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
                                      background: '#0f172a', 
                                      borderRadius: '6px',
                                      borderLeft: '4px solid #06b6d4'
                                    }}>
                                      <ul style={{ margin: '0', paddingLeft: '20px', lineHeight: '1.8' }}>
                                        {element.applicationItems.map((item, i) => (
                                          <li key={i} style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '8px' }}>
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
                                    <strong style={{ color: '#ec4899', display: 'block', marginBottom: '8px', fontSize: '0.95rem' }}>
                                      📌 Important Notes:
                                    </strong>
                                    <div style={{ 
                                      padding: '12px', 
                                      background: '#0f172a', 
                                      borderRadius: '6px',
                                      borderLeft: '4px solid #ec4899'
                                    }}>
                                      <p style={{ margin: '0', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6' }}>
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
                                  background: '#1e293b',
                                  border: '1px solid #475569',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  fontSize: '0.95rem',
                                  fontWeight: '600',
                                  color: '#f1f5f9',
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
                            background: '#1e293b',
                            borderRadius: '8px',
                            border: '1px solid #334155',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            animation: 'slideDown 0.3s ease-out'
                          }}>
                            <div style={{ marginBottom: '20px' }}>
                              <strong style={{ color: '#3b82f6', display: 'block', marginBottom: '12px', fontSize: '1rem' }}>
                                ✓ Items to Check:
                              </strong>
                              <div style={{ 
                                padding: '15px', 
                                background: '#0f172a', 
                                borderRadius: '6px',
                                borderLeft: '4px solid #3b82f6'
                              }}>
                                <ul style={{ margin: '0', paddingLeft: '20px', lineHeight: '1.8' }}>
                                  {(() => {
                                    // Parse whatWasChecked into bullet points
                                    const text = validationResult.whatWasChecked
                                    // Split by common patterns: (1), (2), (3) or numbered lists
                                    const items = text.split(/\(?\d+\)|\band\s+\(?\d+\)|,\s+and\s+/).filter(item => item.trim().length > 10)
                                    
                                    if (items.length > 1) {
                                      return items.map((item, i) => (
                                        <li key={i} style={{ fontSize: '0.9rem', color: '#cbd5e1', marginBottom: '6px' }}>
                                          {item.trim().replace(/^(whether|that|if)\s+/i, '')}
                                        </li>
                                      ))
                                    } else {
                                      return <li style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{text}</li>
                                    }
                                  })()}
                                </ul>
                                
                                <div style={{ 
                                  marginTop: '15px',
                                  paddingTop: '15px',
                                  borderTop: '1px solid #334155'
                                }}>
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
                                          navigator.clipboard.writeText(validationResult.evidence).then(() => {
                                            alert('✅ Evidence copied to clipboard!')
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
                                    {validationResult.evidenceSection && validationResult.evidenceSection !== 'Not found' && (
                                      <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '8px',
                                        marginBottom: '8px',
                                        padding: '6px 10px',
                                        background: '#1e293b',
                                        borderRadius: '4px',
                                        border: '1px solid #475569'
                                      }}>
                                        <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>📂</span>
                                        <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontStyle: 'italic' }}>
                                          Found in: {validationResult.evidenceSection}
                                        </span>
                                      </div>
                                    )}
                                    {validationResult.evidenceReferences && validationResult.evidenceReferences.length > 0 && (
                                      <div style={{ marginBottom: '8px' }}>
                                        <div style={{ 
                                          fontSize: '0.8rem', 
                                          color: '#94a3b8', 
                                          marginBottom: '6px',
                                          fontWeight: '600'
                                        }}>
                                          📌 References in Application:
                                        </div>
                                        <ul style={{ 
                                          margin: '0', 
                                          paddingLeft: '20px', 
                                          listStyleType: 'none'
                                        }}>
                                          {validationResult.evidenceReferences.map((ref, idx) => (
                                            <li key={idx} style={{ 
                                              fontSize: '0.8rem', 
                                              color: '#cbd5e1',
                                              marginBottom: '4px',
                                              paddingLeft: '0',
                                              display: 'flex',
                                              alignItems: 'flex-start',
                                              gap: '6px'
                                            }}>
                                              <span style={{ color: '#3b82f6', flexShrink: 0 }}>•</span>
                                              <span>{ref}</span>
                                            </li>
                                          ))}
                                        </ul>
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
                                              <li key={i} style={{ fontSize: '0.9rem', color: '#cbd5e1', marginBottom: '8px' }}>
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
                                          color: '#cbd5e1',
                                          lineHeight: '1.6'
                                        }}>
                                          {highlightQuotes(evidence)}
                                        </p>
                                      )
                                    }
                                  })()}
                                </div>
                              </div>
                            </div>
                            
                            {validationResult.mustAddressValidation && validationResult.mustAddressValidation.length > 0 && (
                              <div style={{ marginTop: '20px' }}>
                                <strong style={{ color: '#3b82f6', display: 'block', marginBottom: '12px', fontSize: '1rem' }}>
                                  ✓ Must Address Items Validation:
                                </strong>
                                <div style={{ 
                                  padding: '15px', 
                                  background: '#0f172a', 
                                  borderRadius: '6px',
                                  border: '1px solid #334155'
                                }}>
                                  {validationResult.mustAddressValidation.map((item, idx) => (
                                    <div key={idx} style={{ 
                                      marginBottom: idx < validationResult.mustAddressValidation.length - 1 ? '15px' : '0',
                                      paddingBottom: idx < validationResult.mustAddressValidation.length - 1 ? '15px' : '0',
                                      borderBottom: idx < validationResult.mustAddressValidation.length - 1 ? '1px solid #334155' : 'none'
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
                              background: '#0f172a',
                              borderRadius: '8px',
                              borderLeft: `4px solid ${isCompliant ? '#10b981' : '#f59e0b'}`
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <strong style={{ 
                                  color: '#f1f5f9',
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
                                color: '#e2e8f0',
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
        )}

        {activeTab === 'compare' && (
          <div>
            <h2 style={{ color: '#f1f5f9', marginBottom: '20px' }}>🔍 Compare AI Analysis with Manual Review</h2>
            
            {!showComparison ? (
              <div>
                <p style={{ color: '#cbd5e1', marginBottom: '20px', fontSize: '0.95rem' }}>
                  Upload a manual review PDF to compare it side-by-side with the AI analysis results.
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
                  <h3>{manualReviewFile ? manualReviewFile.name : 'Drop Manual Review PDF here or click to upload'}</h3>
                  <p>Manual Review Document PDF</p>
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
                  background: '#1e293b',
                  borderRadius: '8px',
                  border: '1px solid #475569'
                }}>
                  <div>
                    <h3 style={{ color: '#f1f5f9', margin: '0 0 5px 0' }}>
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
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        transition: 'all 0.3s'
                      }}
                      onMouseEnter={(e) => e.target.style.background = '#059669'}
                      onMouseLeave={(e) => e.target.style.background = '#10b981'}
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
                        background: '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '600'
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
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '600'
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
                          background: '#1e293b',
                          borderRadius: '12px',
                          border: '2px solid #f59e0b'
                        }}>
                          <div style={{ fontSize: '3rem', marginBottom: '15px' }}>⚠️</div>
                          <h3 style={{ color: '#f59e0b', marginBottom: '10px' }}>Manual Rules Not Loaded</h3>
                          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
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
                          background: '#1e293b',
                          borderRadius: '12px',
                          border: '2px solid #f59e0b'
                        }}>
                          <div style={{ fontSize: '3rem', marginBottom: '15px' }}>⚠️</div>
                          <h3 style={{ color: '#f59e0b', marginBottom: '10px' }}>No Analysis Results</h3>
                          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
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
                        background: '#1e293b',
                        borderRadius: '12px',
                        border: '2px solid #475569',
                        overflow: 'hidden'
                      }}>
                        {/* Chapter Header */}
                        <div style={{
                          padding: '15px 20px',
                          background: '#0f172a',
                          borderBottom: '2px solid #475569'
                        }}>
                          <h3 style={{
                            margin: 0,
                            color: '#f1f5f9',
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
                                  background: isNotApplicable ? '#1e293b' : isCompliant ? '#064e3b' : '#7f1d1d',
                                  borderBottom: `1px solid ${isNotApplicable ? '#64748b' : isCompliant ? '#10b981' : '#ef4444'}`
                                }}>
                                  <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }}>
                                    <strong style={{ color: '#f1f5f9', fontSize: '0.95rem' }}>
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
                                      {isNotApplicable ? '⊘ NOT APPLICABLE' : isCompliant ? '✅ COMPLIANCE' : '❌ NON COMPLIANCE'}
                                    </span>
                                  </div>
                                </div>

                                {/* Side-by-side comparison */}
                                <div style={{
                                  display: 'grid',
                                  gridTemplateColumns: '1fr 1fr',
                                  gap: '0'
                                }}>
                                  {/* AI Analysis */}
                                  <div style={{
                                    padding: '15px',
                                    background: '#0f172a',
                                    borderRight: '1px solid #475569'
                                  }}>
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      marginBottom: '10px'
                                    }}>
                                      <span style={{ fontSize: '1.2rem' }}>🤖</span>
                                      <strong style={{ color: '#3b82f6', fontSize: '0.9rem' }}>
                                        AI Analysis
                                      </strong>
                                    </div>
                                    <p style={{
                                      margin: '0 0 10px 0',
                                      color: '#cbd5e1',
                                      fontSize: '0.85rem',
                                      lineHeight: '1.5'
                                    }}>
                                      {element.requirementText}
                                    </p>
                                    {validationResult.evidence && (
                                      <div style={{
                                        marginTop: '10px',
                                        padding: '10px',
                                        background: '#1e293b',
                                        borderRadius: '6px',
                                        border: '1px solid #334155'
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
                                          color: '#e2e8f0',
                                          lineHeight: '1.5'
                                        }}>
                                          {validationResult.evidence.substring(0, 200)}
                                          {validationResult.evidence.length > 200 ? '...' : ''}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Manual Review */}
                                  <div style={{
                                    padding: '15px',
                                    background: '#0f172a'
                                  }}>
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      marginBottom: '10px'
                                    }}>
                                      <span style={{ fontSize: '1.2rem' }}>👤</span>
                                      <strong style={{ color: '#10b981', fontSize: '0.9rem' }}>
                                        Manual Review
                                      </strong>
                                    </div>
                                    
                                    {foundInManual ? (
                                      <div>
                                        {/* Manual Compliance Status */}
                                        {manualComplianceStatus && (
                                          <div style={{
                                            padding: '8px 12px',
                                            background: manualComplianceStatus === 'compliance' ? '#064e3b' : 
                                                       manualComplianceStatus === 'non-compliance' ? '#7f1d1d' : '#78350f',
                                            borderRadius: '6px',
                                            border: `1px solid ${manualComplianceStatus === 'compliance' ? '#10b981' : 
                                                                 manualComplianceStatus === 'non-compliance' ? '#ef4444' : '#f59e0b'}`,
                                            marginBottom: '10px'
                                          }}>
                                            <div style={{
                                              fontSize: '0.8rem',
                                              color: manualComplianceStatus === 'compliance' ? '#10b981' : 
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
                                            background: '#1e293b',
                                            borderRadius: '6px',
                                            border: '1px solid #475569',
                                            marginBottom: '10px'
                                          }}>
                                            <div style={{
                                              fontSize: '0.75rem',
                                              color: '#94a3b8',
                                              marginBottom: '5px',
                                              fontWeight: '600',
                                              textTransform: 'uppercase'
                                            }}>
                                              Comments:
                                            </div>
                                            <div style={{
                                              fontSize: '0.8rem',
                                              color: '#e2e8f0',
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
                                            background: '#1e293b',
                                            borderRadius: '6px',
                                            border: '1px solid #10b981'
                                          }}>
                                            <div style={{
                                              fontSize: '0.75rem',
                                              color: '#10b981',
                                              marginBottom: '5px',
                                              fontWeight: '600',
                                              textTransform: 'uppercase'
                                            }}>
                                              Selected Option:
                                            </div>
                                            <div style={{
                                              fontSize: '0.8rem',
                                              color: '#cbd5e1',
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
                                        background: '#1e293b',
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
