# HRSA Compliance Analysis - API Rate Limit Configuration

## Current Issue Summary
The application was experiencing 429 (Too Many Requests) errors due to Azure OpenAI rate limits being exceeded.

## Azure OpenAI Rate Limits
- **Deployment**: `gpt-4`
- **Tokens Per Minute (TPM)**: 450,000
- **Requests Per Minute (RPM)**: 450

## Application Token Usage
- **Compressed Application Text**: ~593,144 characters
- **Estimated Tokens per Request**: ~148,286 tokens
- **Number of Sections to Analyze**: 9 sections

## Rate Limit Calculation
```
Maximum Requests Per Minute = 450,000 TPM ÷ 148,286 tokens/request = ~3 requests/minute
Minimum Time Between Requests = 60 seconds ÷ 3 = 20 seconds
```

## Implemented Solution

### 1. Sequential Processing
- Process one section at a time (no parallel processing)
- Prevents multiple simultaneous requests from overwhelming the rate limit

### 2. Delay Between Sections
- **25 second delay** between each section analysis
- This ensures we stay safely under the 450K TPM limit
- Formula: 148,286 tokens × 3 requests/min = 444,858 TPM (safely under 450K)

### 3. Retry Logic with Exponential Backoff
If a 429 error occurs despite delays:
- **Attempt 1**: Wait 30 seconds, retry
- **Attempt 2**: Wait 60 seconds, retry
- **Attempt 3**: Wait 90 seconds, retry
- **After 3 attempts**: Mark section as failed and continue

### 4. Text Compression
- Removes redundant content (page markers, separators, extra whitespace)
- Achieves ~10% reduction in payload size
- Original: 659,660 chars → Compressed: 593,144 chars

## Expected Performance

### Timeline for Full Analysis (9 Sections)
```
Text Extraction: ~20-30 seconds
Section 1: ~30 seconds (API call)
Delay: 25 seconds
Section 2: ~30 seconds
Delay: 25 seconds
...
Section 9: ~30 seconds

Total Time: ~7-8 minutes for complete analysis
```

### Success Indicators
- No 429 errors during normal operation
- Consistent ~30 second processing time per section
- Clear console logs showing "Waiting 25 seconds before next section..."
- Retry logic only triggers if Azure has temporary issues

## Configuration Files

### Frontend (App.jsx)
```javascript
const AZURE_OPENAI_DEPLOYMENT = 'gpt-4'
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
// 25 second delay between sections
```

### Backend (batch-processor.js)
```javascript
AZURE_OPENAI_DEPLOYMENT: 'gpt-4'
BATCH_SIZE: 1 (sequential)
// 25 second delay between sections
```

## Troubleshooting

### If 429 Errors Still Occur
1. **Wait 10-15 minutes** for Azure rate limit window to reset
2. **Hard refresh browser** (Ctrl + Shift + R)
3. **Clear cache** in Settings tab
4. Verify no other processes are using the same Azure OpenAI deployment

### If Analysis Takes Too Long
- Current configuration: ~7-8 minutes is expected and optimal
- Reducing delays will cause 429 errors
- Consider upgrading Azure OpenAI tier for higher TPM limits

### Alternative: Upgrade Azure OpenAI Tier
To reduce analysis time, request higher rate limits from Azure:
- **Standard Tier**: Up to 240K TPM
- **Premium Tier**: Up to 1M+ TPM
- With 1M TPM, delays could be reduced to ~5 seconds

## Key Takeaways
1. **25 second delays are mandatory** with current 450K TPM limit
2. **Sequential processing is required** - no parallel requests
3. **Retry logic handles transient errors** automatically
4. **7-8 minute analysis time is optimal** for current rate limits
5. **Do not reduce delays** below 20 seconds or 429 errors will return

## Implementation Date
January 22, 2026

## Status
✅ **IMPLEMENTED AND TESTED**
- Retry logic fixed and working correctly
- 25 second delays configured
- Sequential processing enforced
- Text compression optimized (~10% reduction)
