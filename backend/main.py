import os
import json
import base64
import tempfile
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from pydantic import BaseModel, Field
from typing import List, Optional
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

# LangChain Imports
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate
from langchain.output_parsers import PydanticOutputParser
from langchain_core.output_parsers import JsonOutputParser

# Google Auth for credentials
from google.oauth2 import service_account

# Google Cloud AI Imports with service flags
try:
    from google.cloud import documentai
    DOCUMENTAI_AVAILABLE = True
except ImportError:
    DOCUMENTAI_AVAILABLE = False

try:
    from google.cloud import translate_v2 as translate
    TRANSLATE_AVAILABLE = True
except ImportError:
    TRANSLATE_AVAILABLE = False

try:
    from google.cloud import language_v1
    LANGUAGE_AVAILABLE = True
except ImportError:
    LANGUAGE_AVAILABLE = False

try:
    from google.cloud import texttospeech
    TEXTTOSPEECH_AVAILABLE = True
except ImportError:
    TEXTTOSPEECH_AVAILABLE = False

try:
    from google.auth import default
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False

# --- CONFIGURATION ---
load_dotenv()

# --- Google Cloud Credentials Setup for Render ---
def setup_google_cloud_credentials():
    """Setup Google Cloud credentials for Render deployment"""
    
    # Method 1: Use service account JSON content from environment variable
    credentials_json = os.getenv('GOOGLE_APPLICATION_CREDENTIALS_JSON')
    if credentials_json:
        try:
            # Parse the JSON credentials
            credentials_info = json.loads(credentials_json)
            
            # Create temporary file for libraries that need file path
            temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json')
            json.dump(credentials_info, temp_file)
            temp_file.close()
            
            # Set environment variable to temp file path
            os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = temp_file.name
            
            # Create credentials object for direct use
            credentials = service_account.Credentials.from_service_account_info(credentials_info)
            
            print("✅ Google Cloud credentials configured successfully")
            return credentials, temp_file.name
            
        except Exception as e:
            print(f"❌ Error setting up Google Cloud credentials: {e}")
            return None, None
    
    # Method 2: Try existing file path (for local development)
    existing_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    if existing_path and os.path.exists(existing_path):
        print(f"✅ Using existing credentials file: {existing_path}")
        return None, existing_path
    
    print("⚠️ No Google Cloud credentials found")
    return None, None

# Call this before initializing any Google Cloud services
credentials, creds_path = setup_google_cloud_credentials()

# --- Pydantic Models for API Structure (THE FIX IS HERE) ---
# We now use the standard `BaseModel` and `Field` from pydantic
class Highlight(BaseModel):
    text: str = Field(description="The exact text from the document to be highlighted.")
    category: str = Field(description="The risk category. Must be one of: 'High-Risk', 'Cautionary', 'Standard'.")
    explanation: str = Field(description="A simple, one-sentence explanation of why this is important.")

class AnalysisResponse(BaseModel):
    summary: str = Field(description="A concise, easy-to-understand summary of the entire document.")
    highlights: List[Highlight] = Field(description="A list of all identified text highlights.")

class EnhancedAnalysisResponse(BaseModel):
    summary: str = Field(description="A concise, easy-to-understand summary of the entire document.")
    highlights: List[Highlight] = Field(description="A list of all identified text highlights.")
    extracted_text: Optional[str] = Field(description="Text extracted using Document AI")
    document_ai_entities: Optional[List[dict]] = Field(description="Entities extracted by Document AI")
    google_cloud_insights: Optional[dict] = Field(description="Insights from Google Cloud Natural Language API")
    processing_method: str = Field(description="Method used for processing")

class DocumentRequest(BaseModel):
    text: str
    target_language: Optional[str] = "English"

class QuestionRequest(BaseModel):
    document_text: str
    question: str

class TranslationRequest(BaseModel):
    text: str
    target_language: str = "es"

class TextToSpeechRequest(BaseModel):
    text: str
    voice_name: str = "en-US-Standard-A"  # Default female voice
    language_code: str = "en-US"

class ChecklistResponse(BaseModel):
    checklist: List[str]

# --- LangChain & AI Setup ---
llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash",
    api_key=os.getenv("GEMINI_API_KEY"),
    temperature=0.1
)

# 1. Main Analyzer Chain
# This part now works correctly because AnalysisResponse is a modern Pydantic model
analyzer_parser = PydanticOutputParser(pydantic_object=AnalysisResponse)
analyzer_prompt = PromptTemplate(
    template="""
    Analyze the legal document below. Provide a summary and identify key clauses by risk level.
    DOCUMENT TEXT:
    ---
    {document_text}
    ---
    {format_instructions}
    """,
    input_variables=["document_text"],
    partial_variables={"format_instructions": analyzer_parser.get_format_instructions()}
)
analysis_chain = analyzer_prompt | llm | analyzer_parser

# 2. Q&A Chain
qa_prompt = PromptTemplate.from_template("""
Based ONLY on the document text provided below, answer the user's question. If the answer is not found, state that clearly.
DOCUMENT CONTEXT:
---
{document_text}
---
USER'S QUESTION: {question}
""")
qa_chain = qa_prompt | llm

# 3. Checklist Generator Chain
checklist_parser = JsonOutputParser()
checklist_prompt = PromptTemplate(
    template="""
    Analyze the following legal document. Extract a checklist of all the key obligations, responsibilities, and actions required of the primary user or 'Receiving Party'. Return the checklist as a JSON array of strings.
    DOCUMENT TEXT:
    ---
    {document_text}
    ---
    JSON FORMAT: {{"checklist": ["Action item 1", "Action item 2", ...]}}
    """,
    input_variables=["document_text"]
)
checklist_chain = checklist_prompt | llm | checklist_parser

# --- Google Cloud AI Setup ---
def setup_document_ai():
    """Setup Document AI with proper credentials"""
    try:
        if credentials:
            client = documentai.DocumentProcessorServiceClient(credentials=credentials)
        else:
            client = documentai.DocumentProcessorServiceClient()
        
        project_id = os.getenv("GOOGLE_CLOUD_PROJECT_ID", "gen-ai-471115")
        processor_id = os.getenv("DOCAI_PROCESSOR_ID", "10529f2538f89942")
        location = "us"  # or your preferred location
        
        processor_name = client.processor_path(project_id, location, processor_id)
        
        print(f"✅ Document AI configured: {processor_name}")
        return client, processor_name
        
    except Exception as e:
        print(f"❌ Document AI setup failed: {e}")
        return None, None

def setup_natural_language():
    """Setup Natural Language API with proper credentials"""
    try:
        if credentials:
            client = language_v1.LanguageServiceClient(credentials=credentials)
        else:
            client = language_v1.LanguageServiceClient()
        
        print("✅ Natural Language API configured")
        return client
        
    except Exception as e:
        print(f"❌ Natural Language API setup failed: {e}")
        return None

def setup_translation():
    """Setup Translation API with proper credentials"""
    try:
        if credentials:
            client = translate.Client(credentials=credentials)
        else:
            client = translate.Client()
        
        print("✅ Translation API configured")
        return client
        
    except Exception as e:
        print(f"❌ Translation API setup failed: {e}")
        return None

def setup_text_to_speech():
    """Setup Text-to-Speech API with proper credentials"""
    try:
        if credentials:
            client = texttospeech.TextToSpeechClient(credentials=credentials)
        else:
            client = texttospeech.TextToSpeechClient()
        
        print("✅ Text-to-Speech API configured")
        return client
        
    except Exception as e:
        print(f"❌ Text-to-Speech API setup failed: {e}")
        return None

def calculate_readability_score(complexity_indicators):
    """Calculate a simple readability score for legal documents"""
    avg_length = complexity_indicators.get("avg_sentence_length", 20)
    pos_diversity = complexity_indicators.get("unique_pos_tags", 10)
    
    # Simple scoring algorithm (lower is more readable)
    score = (avg_length * 0.6) + (pos_diversity * 0.4)
    
    if score < 15:
        return {"score": round(score, 2), "level": "Easy to read"}
    elif score < 25:
        return {"score": round(score, 2), "level": "Moderate complexity"}
    else:
        return {"score": round(score, 2), "level": "Complex legal language"}


# --- FastAPI App ---
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Initialize all Google Cloud services at startup
print("🚀 Initializing Google Cloud AI services...")
document_ai_client, processor_name = setup_document_ai()
language_client = setup_natural_language()
translate_client = setup_translation()
tts_client = setup_text_to_speech()
print("✅ Google Cloud AI services initialization complete!")

# --- API ENDPOINTS ---
@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_document_endpoint(request: DocumentRequest):
    """Receives raw text and a target language, then sends to Gemini for analysis."""
    try:
        response= await analysis_chain.ainvoke({"document_text": request.text})
        return response
    except Exception as e:
        return {"error": str(e)}
@app.post("/ask")
async def ask_question_endpoint(request: QuestionRequest):
    response = await qa_chain.ainvoke({
        "document_text": request.document_text,
        "question": request.question
    })
    return {"answer": response.content}

@app.post("/generate_checklist", response_model=ChecklistResponse)
async def generate_checklist_endpoint(request: DocumentRequest):
    response = await checklist_chain.ainvoke({"document_text": request.text})
    return response

# --- Enhanced Google Cloud AI Endpoints ---

@app.post("/analyze_with_docai")
async def analyze_with_document_ai(file: UploadFile = File(...)):
    """
    Process document using Google Cloud Document AI OCR processor.
    Only Google Document AI is used (no fallback).
    """
    try:
        file_content = await file.read()
        file_ext = os.path.splitext(file.filename)[-1].lower()
        # Set correct mime type
        if file_ext == ".pdf":
            mime_type = "application/pdf"
        elif file_ext in [".jpg", ".jpeg"]:
            mime_type = "image/jpeg"
        elif file_ext == ".png":
            mime_type = "image/png"
        elif file_ext in [".tiff", ".tif"]:
            mime_type = "image/tiff"
        elif file_ext == ".bmp":
            mime_type = "image/bmp"
        elif file_ext == ".gif":
            mime_type = "image/gif"
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type for Document AI OCR.")

        # Document AI setup
        if not document_ai_client or not processor_name:
            raise HTTPException(status_code=500, detail="Document AI not configured correctly.")

        # Prepare request
        request = documentai.ProcessRequest(
            name=processor_name,
            raw_document=documentai.RawDocument(
                content=file_content,
                mime_type=mime_type
            )
        )

        # Process the document
        result = document_ai_client.process_document(request=request)
        document = result.document

        # Extract text
        extracted_text = document.text or ""
        if not extracted_text.strip():
            raise HTTPException(status_code=422, detail="No text extracted. Make sure you are using a Document OCR processor and the file is not blank.")

        # Extract entities (optional)


        # Analyze with Gemini
        analysis_result = await analysis_chain.ainvoke({
            "document_text": extracted_text
        })

        return {
            "summary": analysis_result.summary,
            "highlights": analysis_result.highlights,
            "extracted_text": extracted_text,
            "processing_method": "Google Cloud Document AI OCR"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document AI processing failed: {str(e)}")

@app.post("/enhanced_analysis")
async def enhanced_document_analysis(request: DocumentRequest):
    """Enhanced analysis using Google Cloud Natural Language API + Gemini"""
    try:
        google_cloud_insights = {}
        
        if language_client and LANGUAGE_AVAILABLE:
            try:
                # Prepare document for Natural Language API
                document = language_v1.Document(
                    content=request.text,
                    type_=language_v1.Document.Type.PLAIN_TEXT
                )
                
                # Analyze sentiment
                sentiment_response = language_client.analyze_sentiment(
                    request={"document": document}
                )
                
                # Analyze entities
                entities_response = language_client.analyze_entities(
                    request={"document": document}
                )
                
                # Analyze syntax
                syntax_response = language_client.analyze_syntax(
                    request={"document": document}
                )
                
                # Extract insights
                sentiment_score = sentiment_response.document_sentiment.score
                sentiment_magnitude = sentiment_response.document_sentiment.magnitude
                
                entities = []
                for entity in entities_response.entities:
                    entities.append({
                        "name": entity.name,
                        "type": entity.type_.name,
                        "salience": entity.salience,
                        "sentiment_score": entity.sentiment.score if entity.sentiment else None
                    })
                
                # Calculate complexity
                complexity_indicators = {
                    "avg_sentence_length": len(syntax_response.tokens) / len(syntax_response.sentences) if syntax_response.sentences else 0,
                    "unique_pos_tags": len(set([token.part_of_speech.tag.name for token in syntax_response.tokens])),
                    "total_tokens": len(syntax_response.tokens)
                }
                
                google_cloud_insights = {
                    "sentiment": {
                        "score": sentiment_score,
                        "magnitude": sentiment_magnitude,
                        "interpretation": "Positive" if sentiment_score > 0.1 else "Negative" if sentiment_score < -0.1 else "Neutral"
                    },
                    "entities": entities,
                    "complexity": complexity_indicators,
                    "readability_score": calculate_readability_score(complexity_indicators)
                }
            except Exception as nl_error:
                google_cloud_insights = {"error": f"Natural Language API failed: {str(nl_error)}"}
        else:
            google_cloud_insights = {"error": "Natural Language API not available"}
        
        # Get Gemini analysis
        gemini_analysis = await analysis_chain.ainvoke({
            "document_text": request.text
        })
        
        # Combine all insights
        enhanced_response = {
            "summary": gemini_analysis.summary,
            "highlights": gemini_analysis.highlights,
            "google_cloud_insights": google_cloud_insights,
            "processing_method": "Google Gemini + Natural Language API" if google_cloud_insights and not google_cloud_insights.get("error") else "Google Gemini Only"
        }
        
        return enhanced_response
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Enhanced analysis failed: {str(e)}")

class TranslateSummaryRequest(BaseModel):
    summary: str
    target_language: str

@app.post("/translate_summary")
async def translate_summary(request: TranslateSummaryRequest):
    """Translate analysis summary to different language using Google Translate"""
    try:
        if not translate_client:
            raise HTTPException(status_code=503, detail="Translation service not available")
        
        # Map language names to language codes
        language_codes = {
            "English": "en",
            "Spanish": "es", 
            "French": "fr",
            "German": "de",
            "Italian": "it",
            "Portuguese": "pt",
            "Russian": "ru",
            "Chinese": "zh",
            "Japanese": "ja",
            "Korean": "ko",
            "Arabic": "ar",
            "Hindi": "hi",
            "Dutch": "nl"
        }
        
        target_lang_code = language_codes.get(request.target_language, request.target_language.lower())
        
        # Translate the summary
        result = translate_client.translate(
            request.summary,
            target_language=target_lang_code
        )
        
        return {
            "original_summary": request.summary,
            "translated_summary": result['translatedText'],
            "source_language": result.get('detectedSourceLanguage', 'unknown'),
            "target_language": request.target_language
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")
async def translate_legal_document(request: TranslationRequest):
    """Translate legal document to different languages"""
    try:
        if not translate_client:
            raise HTTPException(status_code=503, detail="Translation service not available")
        
        source_text = request.text
        target_language = request.target_language
        
        # Detect source language
        detection = translate_client.detect_language(source_text)
        source_language = detection['language']
        
        # Translate the document
        result = translate_client.translate(
            source_text,
            target_language=target_language,
            source_language=source_language
        )
        
        # Analyze translated document
        translated_analysis = await analysis_chain.ainvoke({"document_text": result['translatedText']})
        
        return {
            "original_language": source_language,
            "target_language": target_language,
            "translated_text": result['translatedText'],
            "analysis": {
                "summary": translated_analysis.summary,
                "highlights": translated_analysis.highlights
            },
            "service": "Google Cloud Translation API"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")

@app.post("/extract_entities")
async def extract_legal_entities(request: DocumentRequest):
    """Extract legal entities using Natural Language API"""
    try:
        if not language_client:
            return {"entities": [], "service": "Natural Language API not available"}
        
        # Prepare document
        document = language_v1.Document(
            content=request.text,
            type_=language_v1.Document.Type.PLAIN_TEXT
        )
        
        # Extract entities
        entities_response = language_client.analyze_entities(
            request={"document": document}
        )
        
        # Format entities
        entities = []
        for entity in entities_response.entities:
            entities.append({
                "name": entity.name,
                "type": entity.type_.name,
                "salience": entity.salience,
                "sentiment_score": entity.sentiment.score if entity.sentiment else None,
                "mentions": [mention.text.content for mention in entity.mentions[:3]]  # First 3 mentions
            })
        
        return {"entities": entities, "service": "Google Cloud Natural Language API"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Entity extraction failed: {str(e)}")

@app.post("/text-to-speech")
async def convert_text_to_speech(request: TextToSpeechRequest):
    """Convert text to speech using Google Cloud Text-to-Speech API"""
    try:
        if not tts_client:
            raise HTTPException(status_code=503, detail="Text-to-Speech service not available")
        
        # Limit text length for performance and API limits
        text_to_convert = request.text[:5000]  # Limit to 5000 characters
        if len(request.text) > 5000:
            text_to_convert += "... (text truncated for audio)"
        
        # Configure the text input to be synthesized
        synthesis_input = texttospeech.SynthesisInput(text=text_to_convert)
        
        # Build the voice request
        try:
            # First try with specific voice name
            voice = texttospeech.VoiceSelectionParams(
                language_code=request.language_code,
                name=request.voice_name,
                ssml_gender=texttospeech.SsmlVoiceGender.FEMALE
            )
            
            # Select the type of audio file to return
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3,
                speaking_rate=1.0,  # Normal speed
                pitch=0.0,  # Normal pitch
                volume_gain_db=0.0  # Normal volume
            )
            
            # Perform the text-to-speech request
            response = tts_client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config
            )
            
        except Exception as voice_error:
            # Fallback: try with just language code, let Google pick the best voice
            voice = texttospeech.VoiceSelectionParams(
                language_code=request.language_code,
                ssml_gender=texttospeech.SsmlVoiceGender.FEMALE
            )
            
            # Perform the text-to-speech request with fallback voice
            response = tts_client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config
            )
        
        # Return the audio content as base64 for frontend consumption
        audio_base64 = base64.b64encode(response.audio_content).decode('utf-8')
        
        return {
            "audio_base64": audio_base64,
            "audio_format": "mp3",
            "text_length": len(text_to_convert),
            "voice_used": request.voice_name,
            "service": "Google Cloud Text-to-Speech API"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Text-to-Speech conversion failed: {str(e)}")

