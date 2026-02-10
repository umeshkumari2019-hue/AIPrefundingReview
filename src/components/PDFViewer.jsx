import { useState, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Configure PDF.js worker - use local file from public directory
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

// Add CSS animation for pulse effect
const style = document.createElement('style')
style.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 0.15; }
    50% { opacity: 0.3; }
  }
`
if (!document.head.querySelector('style[data-pdf-pulse]')) {
  style.setAttribute('data-pdf-pulse', 'true')
  document.head.appendChild(style)
}

export default function PDFViewer({ pdfFile, highlightPage, highlightText, onLoadSuccess }) {
  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [fileUrl, setFileUrl] = useState(null)
  const pageRefs = useRef({})
  const containerRef = useRef(null)

  // Convert File object to URL for PDF.js
  useEffect(() => {
    if (pdfFile instanceof File) {
      const url = URL.createObjectURL(pdfFile)
      setFileUrl(url)
      
      // Cleanup URL when component unmounts or file changes
      return () => {
        URL.revokeObjectURL(url)
      }
    } else if (typeof pdfFile === 'string') {
      setFileUrl(pdfFile)
    } else {
      setFileUrl(null)
    }
  }, [pdfFile])

  useEffect(() => {
    if (highlightPage && highlightPage > 0 && highlightPage <= numPages) {
      setPageNumber(highlightPage)
      // Scroll to the highlighted page
      setTimeout(() => {
        const pageElement = pageRefs.current[highlightPage]
        if (pageElement && containerRef.current) {
          pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          
          // Enhanced highlight effect with multiple visual cues
          pageElement.style.boxShadow = '0 0 30px 10px rgba(59, 130, 246, 0.8), 0 0 60px 20px rgba(59, 130, 246, 0.4)'
          pageElement.style.border = '4px solid #3b82f6'
          pageElement.style.transform = 'scale(1.02)'
          pageElement.style.transition = 'all 0.3s ease'
          pageElement.style.position = 'relative'
          pageElement.style.zIndex = '10'
          
          // Add a pulsing animation overlay
          const overlay = document.createElement('div')
          overlay.style.position = 'absolute'
          overlay.style.top = '0'
          overlay.style.left = '0'
          overlay.style.right = '0'
          overlay.style.bottom = '0'
          overlay.style.background = 'rgba(59, 130, 246, 0.15)'
          overlay.style.pointerEvents = 'none'
          overlay.style.animation = 'pulse 1s ease-in-out 3'
          overlay.style.borderRadius = '4px'
          pageElement.appendChild(overlay)
          
          // Highlight text content within the PDF if highlightText is provided
          if (highlightText) {
            setTimeout(() => {
              highlightTextInPage(pageElement, highlightText)
            }, 500)
          }
          
          // Remove highlight after 4 seconds
          setTimeout(() => {
            pageElement.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.3)'
            pageElement.style.border = 'none'
            pageElement.style.transform = 'scale(1)'
            pageElement.style.zIndex = '1'
            if (overlay && overlay.parentNode) {
              overlay.remove()
            }
          }, 4000)
        }
      }, 100)
    }
  }, [highlightPage, numPages, highlightText])

  // Function to highlight text content within a PDF page
  const highlightTextInPage = (pageElement, searchText) => {
    if (!searchText || searchText.length < 3) return
    
    // Get the text layer of the PDF page
    const textLayer = pageElement.querySelector('.react-pdf__Page__textContent')
    if (!textLayer) return
    
    // Get all text spans in the page
    const textSpans = textLayer.querySelectorAll('span')
    
    // Extract first few words from evidence text (up to 50 chars for better matching)
    const searchWords = searchText.substring(0, 100).toLowerCase().trim()
    
    // Search through text spans and highlight matches
    textSpans.forEach(span => {
      const spanText = span.textContent.toLowerCase()
      
      // Check if this span contains part of the search text
      if (searchWords.includes(spanText) || spanText.includes(searchWords.substring(0, 20))) {
        // Highlight the span with yellow background
        span.style.backgroundColor = 'rgba(255, 255, 0, 0.6)'
        span.style.padding = '2px'
        span.style.borderRadius = '2px'
        span.style.boxShadow = '0 0 10px rgba(255, 255, 0, 0.8)'
        
        // Remove highlight after 6 seconds
        setTimeout(() => {
          span.style.backgroundColor = 'transparent'
          span.style.boxShadow = 'none'
        }, 6000)
      }
    })
  }

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages)
    if (onLoadSuccess) {
      onLoadSuccess(numPages)
    }
  }

  const goToPrevPage = () => {
    setPageNumber(prev => Math.max(1, prev - 1))
  }

  const goToNextPage = () => {
    setPageNumber(prev => Math.min(numPages, prev + 1))
  }

  const zoomIn = () => {
    setScale(prev => Math.min(2.0, prev + 0.1))
  }

  const zoomOut = () => {
    setScale(prev => Math.max(0.5, prev - 0.1))
  }

  const resetZoom = () => {
    setScale(1.0)
  }

  if (!fileUrl) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: '#1e293b',
        borderRadius: '12px',
        border: '2px dashed #475569',
        padding: '40px',
        textAlign: 'center'
      }}>
        <div>
          <div style={{ fontSize: '4rem', marginBottom: '20px' }}>📄</div>
          <h3 style={{ color: '#94a3b8', marginBottom: '10px' }}>No PDF Loaded</h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
            Upload and analyze an application to view the PDF
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0f172a',
      borderRadius: '12px',
      overflow: 'hidden'
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        background: '#1e293b',
        borderBottom: '2px solid #334155',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        {/* Page Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
            style={{
              padding: '8px 16px',
              background: pageNumber <= 1 ? '#334155' : '#3b82f6',
              color: pageNumber <= 1 ? '#64748b' : 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: pageNumber <= 1 ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              fontWeight: '600'
            }}
          >
            ← Prev
          </button>
          
          <span style={{ color: '#f1f5f9', fontSize: '0.9rem', fontWeight: '500' }}>
            Page {pageNumber} of {numPages || '...'}
          </span>
          
          <button
            onClick={goToNextPage}
            disabled={pageNumber >= numPages}
            style={{
              padding: '8px 16px',
              background: pageNumber >= numPages ? '#334155' : '#3b82f6',
              color: pageNumber >= numPages ? '#64748b' : 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: pageNumber >= numPages ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              fontWeight: '600'
            }}
          >
            Next →
          </button>
        </div>

        {/* Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={zoomOut}
            style={{
              padding: '8px 12px',
              background: '#334155',
              color: '#f1f5f9',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600'
            }}
            title="Zoom Out"
          >
            −
          </button>
          
          <span style={{ color: '#f1f5f9', fontSize: '0.9rem', minWidth: '60px', textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </span>
          
          <button
            onClick={zoomIn}
            style={{
              padding: '8px 12px',
              background: '#334155',
              color: '#f1f5f9',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600'
            }}
            title="Zoom In"
          >
            +
          </button>
          
          <button
            onClick={resetZoom}
            style={{
              padding: '8px 12px',
              background: '#334155',
              color: '#f1f5f9',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '600'
            }}
            title="Reset Zoom"
          >
            Reset
          </button>
        </div>
      </div>

      {/* PDF Document */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px',
          background: '#0f172a'
        }}
      >
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              <div style={{ fontSize: '2rem', marginBottom: '10px' }}>⏳</div>
              <p>Loading PDF...</p>
            </div>
          }
          error={
            <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>
              <div style={{ fontSize: '2rem', marginBottom: '10px' }}>❌</div>
              <p>Failed to load PDF</p>
            </div>
          }
        >
          {Array.from(new Array(numPages), (el, index) => (
            <div
              key={`page_${index + 1}`}
              ref={el => pageRefs.current[index + 1] = el}
              style={{
                marginBottom: '20px',
                background: 'white',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                transition: 'box-shadow 0.3s ease',
                borderRadius: '4px',
                overflow: 'hidden'
              }}
            >
              <Page
                pageNumber={index + 1}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  )
}
