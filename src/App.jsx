import { useState, useEffect } from 'react'
import axios from 'axios'

// Azure Document Intelligence configuration
const AZURE_DOC_ENDPOINT = ''
const AZURE_DOC_KEY = ''

// Azure OpenAI configuration
const AZURE_OPENAI_ENDPOINT = ''
const AZURE_OPENAI_KEY = ''
const AZURE_OPENAI_DEPLOYMENT = ''  // Your deployment name

const SECTIONS = [
  //'Needs Assessment',
   //'Sliding Fee Discount Program',
   //'Key Management Staff',
   //'Contracts and Subawards',
  // 'Collaborative Relationships',
  // 'Billing and Collections',
   'Budget',
  // 'Board Authority',
  // 'Board Composition'
]

function App() {
  const [activeTab, setActiveTab] = useState('upload')
  const [manualFile, setManualFile] = useState(null)
  const [applicationFile, setApplicationFile] = useState(null)
  const [applicationName, setApplicationName] = useState('')
  const [status, setStatus] = useState('')
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState(null)
  const [manualRules, setManualRules] = useState(null)
  const [expandedDetails, setExpandedDetails] = useState({})

  // Load saved compliance rules from JSON file on mount
  useEffect(() => {
    loadSavedRules()
  }, [])

  const loadSavedRules = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/load-rules')
      if (response.data.success) {
        setManualRules(response.data.rules)
        setStatus('✅ Loaded saved compliance rules from file')
        console.log('Loaded rules from file:', response.data.rules.length, 'chapters')
      }
    } catch (error) {
      console.log('No saved rules found or backend not running')
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
c) Using the most recently available data..."

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
          "footnotes": "Any footnote text with numbers like 13, 14"
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

  // Azure OpenAI - Validate compliance
  const validateCompliance = async (section, rules, applicationContent) => {
    // Find the chapter that matches this section
    const chapter = rules.find(r => {
      if (r.section === section) return true
      if (section.includes(r.section) || r.section.includes(section)) return true
      return false
    })
    
    if (!chapter || !chapter.elements) {
      return { compliant: [], nonCompliant: [] }
    }
    
    const compliantItems = []
    const nonCompliantItems = []

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

NOTE: The compliance manual suggests checking "${element.applicationSection || 'various sections'}" - but this is only a HINT for humans. 
DO NOT limit your search to those sections. Search the ENTIRE application document for evidence.

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
- Only mark COMPLIANT if you find CLEAR, EXPLICIT proof that fully satisfies the requirement
- If evidence is unclear, partial, ambiguous, or incomplete, mark NON_COMPLIANT
- If no evidence is found, mark NON_COMPLIANT and state it is missing
- ABSOLUTELY FORBIDDEN: Do NOT guess, assume, infer, or make up any information
- ABSOLUTELY FORBIDDEN: Do NOT use general knowledge about what health centers "typically" do
- ABSOLUTELY FORBIDDEN: Do NOT mark compliant without direct, explicit proof from the application text
- REQUIRED: Every piece of evidence must be a direct quote from the application with exact page number
- REQUIRED: If you cannot provide a direct quote and page number, mark as NON_COMPLIANT

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

Return JSON: {
  "status": "COMPLIANT" or "NON_COMPLIANT",
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

    return { compliantItems, nonCompliantItems }
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
    setStatus('Extracting text from application...')

    try {
      const content = await extractTextFromPDF(applicationFile)
      setStatus('Analyzing compliance for each section...')
      
      const sectionResults = {}
      
      for (let i = 0; i < SECTIONS.length; i++) {
        const section = SECTIONS[i]
        setStatus(`Analyzing ${section} (${i + 1}/${SECTIONS.length})...`)
        
        const result = await validateCompliance(section, manualRules, content)
        sectionResults[section] = result
      }
      
      setResults(sectionResults)
      setStatus('✅ Analysis complete!')
      setActiveTab('results')
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`)
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
        </div>

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
                
                {manualRules.map((chapter, chapterIdx) => (
                  <div key={chapterIdx} className="section" style={{ marginBottom: '30px', border: '1px solid #334155', borderRadius: '8px', padding: '20px', background: '#1e293b' }}>
                    <h3 style={{ color: '#3b82f6', marginBottom: '15px' }}>
                      📋 {chapter.chapter || chapter.section}
                    </h3>
                    
                    {chapter.authority && (
                      <div style={{ marginBottom: '20px', padding: '12px', background: '#0f172a', borderRadius: '6px', border: '1px solid #334155' }}>
                        <strong style={{ color: '#f1f5f9' }}>📜 Authority:</strong>
                        <p style={{ margin: '5px 0 0 0', fontSize: '0.9rem', color: '#cbd5e1' }}>
                          {chapter.authority}
                        </p>
                      </div>
                    )}
                    
                    {chapter.elements && chapter.elements.length > 0 && (
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
                ))}
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
          </div>
        )}

        {activeTab === 'results' && results && (
          <div className="results">
            <h2 style={{ marginBottom: '30px', color: '#f1f5f9' }}>📊 Compliance Results: {applicationName}</h2>
            
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
                    <h3 style={{ color: '#3b82f6', margin: '0', fontSize: '1.4rem', fontWeight: '600' }}>
                      📋 {chapter.chapter || chapter.section}
                    </h3>
                    <span style={{ fontSize: '1.5rem', transition: 'transform 0.3s', transform: isChapterExpanded ? 'rotate(180deg)' : 'rotate(0deg)', color: '#3b82f6' }}>
                      ▼
                    </span>
                  </button>
                  
                  {isChapterExpanded && chapter.elements && chapter.elements.map((element, elemIdx) => {
                    // Find validation result for this element
                    const allItems = [...result.compliantItems, ...result.nonCompliantItems]
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
                    
                    return (
                      <div key={elemIdx} style={{ 
                        marginTop: elemIdx === 0 ? '20px' : '0',
                        marginBottom: '20px', 
                        border: `2px solid ${isCompliant ? '#10b981' : '#ef4444'}`,
                        borderRadius: '10px',
                        padding: '20px',
                        background: '#0f172a'
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
                              background: isCompliant ? '#10b981' : '#ef4444',
                              color: 'white',
                              fontWeight: 'bold',
                              fontSize: '0.9rem',
                              whiteSpace: 'nowrap'
                            }}>
                              {isCompliant ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}
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
