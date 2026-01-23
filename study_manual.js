// Study HRSA Compliance Manual structure using Azure Document Intelligence
import axios from 'axios';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const AZURE_DOC_ENDPOINT = process.env.AZURE_DOC_ENDPOINT || '';
const AZURE_DOC_KEY = process.env.AZURE_DOC_KEY || '';

// Path to your HRSA Compliance Manual PDF
const PDF_PATH = process.argv[2] || 'Y:\\Umesh\\HRSA_Compliance_Manual.pdf';

async function analyzeManual() {
  console.log('Reading PDF:', PDF_PATH);
  
  if (!fs.existsSync(PDF_PATH)) {
    console.error('PDF file not found at:', PDF_PATH);
    console.log('Usage: node study_manual.js <path-to-pdf>');
    return;
  }

  const fileBuffer = fs.readFileSync(PDF_PATH);
  
  console.log('Sending to Azure Document Intelligence...');
  
  // Start analysis
  const response = await axios.post(
    `${AZURE_DOC_ENDPOINT}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`,
    fileBuffer,
    {
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_DOC_KEY,
        'Content-Type': 'application/pdf'
      }
    }
  );

  const operationLocation = response.headers['operation-location'];
  console.log('Analysis started, polling for results...');

  // Poll for results
  let result = null;
  while (!result || result.status === 'running') {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const pollResponse = await axios.get(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': AZURE_DOC_KEY }
    });
    result = pollResponse.data;
    console.log('Status:', result.status);
  }

  if (result.status === 'succeeded') {
    console.log('\n=== EXTRACTION COMPLETE ===\n');
    
    const content = result.analyzeResult.content;
    
    // Save full content
    fs.writeFileSync('manual_content.txt', content);
    console.log('Full content saved to: manual_content.txt');
    
    // Analyze structure
    console.log('\n=== DOCUMENT STRUCTURE ===\n');
    console.log('Total characters:', content.length);
    console.log('Total pages:', result.analyzeResult.pages.length);
    
    // Find chapters
    const chapterPattern = /Chapter \d+:/gi;
    const chapters = content.match(chapterPattern);
    console.log('\nChapters found:', chapters ? chapters.length : 0);
    if (chapters) {
      chapters.forEach(ch => console.log('  -', ch));
    }
    
    // Find elements
    const elementPattern = /Element [a-z] –/gi;
    const elements = content.match(elementPattern);
    console.log('\nElements found:', elements ? elements.length : 0);
    
    // Find authority sections
    const authorityPattern = /Authority:/gi;
    const authorities = content.match(authorityPattern);
    console.log('Authority sections found:', authorities ? authorities.length : 0);
    
    // Extract Chapter 3 as example
    console.log('\n=== CHAPTER 3: NEEDS ASSESSMENT (Sample) ===\n');
    const chapter3Start = content.indexOf('Chapter 3: Needs Assessment');
    const chapter9Start = content.indexOf('Chapter 9:');
    
    if (chapter3Start !== -1) {
      const chapter3Content = content.substring(
        chapter3Start, 
        chapter9Start !== -1 ? chapter9Start : chapter3Start + 5000
      );
      
      console.log(chapter3Content.substring(0, 2000));
      console.log('\n[... truncated for display ...]\n');
      
      // Save Chapter 3 separately
      fs.writeFileSync('chapter3_sample.txt', chapter3Content);
      console.log('Chapter 3 content saved to: chapter3_sample.txt');
    }
    
    console.log('\n=== ANALYSIS COMPLETE ===');
    console.log('Review the extracted files to understand the structure.');
    
  } else {
    console.error('Analysis failed:', result.status);
  }
}

analyzeManual().catch(err => {
  console.error('Error:', err.message);
  if (err.response) {
    console.error('Response:', err.response.data);
  }
});
