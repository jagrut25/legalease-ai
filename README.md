# ⚖️ Legalease AI - Intelligent Legal Document Analyzer

> **AI-powered legal document analysis using Google Cloud AI and Gemini 1.5 Flash**

Transform complex legal documents into clear, actionable insights with instant summarization, risk assessment, multi-language support, and interactive Q&A capabilities.

## ✨ **Key Features**

- **📄 Intelligent Document Analysis** - AI-powered summarization and risk assessment
- **🔍 Advanced OCR Processing** - Extract text from PDFs and images  
- **💬 Interactive Q&A** - Ask questions about your documents
- **🌍 Multi-language Support** - Translate summaries to 13+ languages
- **🎵 Text-to-Speech** - Convert document summaries to audio
- **📊 Sentiment Analysis** - Understand document tone and risk levels
- **✅ Action Checklist** - Generate actionable items from legal obligations

**Tech Stack**: Google Gemini 1.5 Flash | Google Cloud Document AI | FastAPI | JavaScript

## 🏗️ **Project Structure**

```
legalease-ai/
├── backend/                   # FastAPI backend server
│   ├── main.py               # Main application entry point
│   └── requirements.txt      # Python dependencies
├── frontend/                 # Web interface
│   ├── app.html             # Main HTML interface
│   ├── script.js            # JavaScript functionality
│   └── style.css            # Styling and layouts
├── .env                     # Environment configuration
└── README.md               # This file
```

## 🚀 **Quick Setup**

### **Prerequisites**
- Python 3.8+
- Google Cloud Account with enabled APIs

### **1. Environment Setup**
```bash
# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux

# Install dependencies
cd backend
pip install -r requirements.txt
```

### **2. Configure Environment Variables**
Create `.env` file in project root:
```env
GEMINI_API_KEY="your-gemini-api-key-here"
GOOGLE_CLOUD_PROJECT_ID="your-project-id"
DOCAI_PROCESSOR_ID="your-processor-id"
GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

### **3. Run Application**
```bash
# Start backend
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Start frontend (new terminal)
cd frontend
python -m http.server 3000
```

**Access**: Frontend at http://localhost:3000 | API docs at http://localhost:8000/docs

## 🔑 **Google Cloud Setup**

### **Quick Setup Steps**
1. **Create Google Cloud Project** at [console.cloud.google.com](https://console.cloud.google.com)
2. **Enable APIs**: Document AI, Natural Language, Translation, Text-to-Speech
3. **Get Gemini API Key** from [makersuite.google.com](https://makersuite.google.com/app/apikey)
4. **Create Document AI Processor** (type: "Document OCR")
5. **Create Service Account** and download JSON key file

### **Enable APIs via CLI**
```bash
gcloud services enable documentai.googleapis.com
gcloud services enable language.googleapis.com
gcloud services enable translate.googleapis.com
gcloud services enable texttospeech.googleapis.com
```

## 🧪 **Demo & Testing**

### **Test with Sample NDA**
```text
MUTUAL NON-DISCLOSURE AGREEMENT

This Agreement is entered into between Company A and Company B for evaluating a potential business relationship.

1. CONFIDENTIAL INFORMATION: Each party may disclose technical data, business plans, and financial information.
2. OBLIGATIONS: The receiving party shall not disclose confidential information to third parties.
3. TERM: This agreement remains in effect for three (3) years.
4. RETURN: All materials must be returned within thirty (30) days upon termination.
```

### **Expected AI Analysis**
- **Summary**: Clear NDA overview with key terms
- **Risk Assessment**: Highlights important clauses by risk level
- **Sentiment Score**: -0.3 to -0.7 (formal legal tone)
- **Q&A Ready**: Ask "What are my obligations?" for detailed response

## 📊 **API Endpoints**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/enhanced_analysis` | POST | Complete document analysis |
| `/analyze_with_docai` | POST | PDF/image upload with OCR |
| `/ask` | POST | Q&A about documents |
| `/translate_summary` | POST | Multi-language translation |
| `/text-to-speech` | POST | Generate audio summaries |

## 🔧 **Key Environment Variables**

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ Yes | Google AI API key |
| `GOOGLE_CLOUD_PROJECT_ID` | ✅ Yes | GCP project ID |
| `DOCAI_PROCESSOR_ID` | ✅ Yes | Document AI processor |
| `GOOGLE_APPLICATION_CREDENTIALS` | ✅ Yes | Service account key path |

## 🐛 **Common Issues & Solutions**

**Authentication Error**: Verify service account permissions and API key validity
**CORS Error**: Backend includes CORS middleware, check frontend API URL
**OCR Error**: Ensure Document AI processor is type "Document OCR"

## 📈 **Performance**
- **Analysis Time**: 15-30 seconds per document
- **File Support**: PDF, images up to 20MB
- **Languages**: 13+ supported for translation and TTS

---

**🏆 Built for Hackathon - Demonstrating AI-powered legal tech innovation**