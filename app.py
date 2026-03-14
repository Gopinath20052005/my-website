from flask import Flask, render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename
import os
import PyPDF2
from gtts import gTTS
import uuid
from datetime import datetime
from googletrans import Translator 
from gtts import gTTS

app = Flask(__name__, template_folder='templates', static_folder='static')

# Configuration
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['AUDIO_OUTPUT_FOLDER'] = 'audio_output'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size
ALLOWED_EXTENSIONS = {'pdf'}

# Create directories if they don't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['AUDIO_OUTPUT_FOLDER'], exist_ok=True)

# Language mapping for voice
LANGUAGE_CODES = {
    'Tamil': 'ta',
    'English': 'en',
    'Hindi': 'hi',
    'Malayalam': 'ml'
}

# Language conversion rules
LANGUAGE_CONVERSION = {
    'Tamil': ['English', 'Hindi', 'Malayalam'],
    'English': ['Tamil', 'Hindi', 'Malayalam'],
    'Malayalam': ['Tamil', 'English', 'Hindi'],
    'Hindi': ['Tamil', 'English', 'Malayalam']
}
translator = Translator()
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_text_from_pdf(file_path):
    """Extract text from PDF file"""
    try:
        text = ""
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                text += page.extract_text()
        return text
    except Exception as e:
        return None

def translate_text(text, target_language):
    """Translate text using googletrans"""
    try:
        target_code = LANGUAGE_CODES.get(target_language, 'en')
        translated = translator.translate(text, dest=target_code)
        return translated.text
    except Exception as e:
        print(f"Translation error: {e}")
        return text

def extract_words_with_timing(text, audio_duration):
    """
    Generate word-level timing data for highlighting synchronization
    Estimates timing based on word count and audio duration
    """
    try:
        words = text.split()
        if not words or audio_duration <= 0:
            return []
        
        # Calculate average time per word
        avg_time_per_word = audio_duration / len(words)
        
        # Generate timing data for each word
        word_timings = []
        current_time = 0
        
        for i, word in enumerate(words):
            word_obj = {
                'word': word,
                'start': round(current_time, 2),
                'end': round(current_time + avg_time_per_word, 2),
                'index': i
            }
            word_timings.append(word_obj)
            current_time += avg_time_per_word
        
        return word_timings
    except Exception as e:
        print(f"Word timing error: {e}")
        return []

def generate_audio(text, language, voice_gender):
    """Generate MP3 audio from text using gTTS with word timing data"""
    try:
        lang_code = LANGUAGE_CODES.get(language, 'en')
        
        # Create gTTS object
        tts = gTTS(text=text, lang=lang_code, slow=False)
        
        # Generate unique filename
        audio_filename = f"{uuid.uuid4()}_{language}_{voice_gender}.mp3"
        audio_path = os.path.join(app.config['AUDIO_OUTPUT_FOLDER'], audio_filename)
        
        # Save audio file
        tts.save(audio_path)
        
        # Estimate audio duration (roughly 150 words per minute = 2.5 words per second)
        word_count = len(text.split())
        estimated_duration = (word_count / 2.5)
        
        # Generate word timing data
        word_timings = extract_words_with_timing(text, estimated_duration)
        
        return {
            'filename': audio_filename,
            'duration': estimated_duration,
            'word_timings': word_timings
        }
    except Exception as e:
        print(f"Audio generation error: {e}")
        return None

def extract_text_page_by_page(file_path, max_pages=None):
    """
    Extract text from PDF file page by page
    Useful for large PDFs to avoid memory issues
    """
    try:
        pages = []
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            num_pages = len(pdf_reader.pages)
            
            for page_num, page in enumerate(pdf_reader.pages):
                if max_pages and page_num >= max_pages:
                    break
                    
                page_text = page.extract_text()
                pages.append({
                    'page_number': page_num + 1,
                    'text': page_text,
                    'word_count': len(page_text.split())
                })
        
        return pages, num_pages
    except Exception as e:
        print(f"Page extraction error: {e}")
        return None, None

def chunk_text(text, chunk_size=500):
    """Split text into chunks for processing large documents"""
    words = text.split()
    chunks = []
    
    for i in range(0, len(words), chunk_size):
        chunk = ' '.join(words[i:i + chunk_size])
        chunks.append({
            'text': chunk,
            'start_word': i,
            'end_word': min(i + chunk_size, len(words)),
            'word_count': len(chunk.split())
        })
    
    return chunks

@app.route('/')
def login():
    """Login page"""
    return render_template('login.html')

@app.route('/home')
def home():
    """Home page"""
    return render_template('home.html')

@app.route('/api/upload-pdf', methods=['POST'])
def upload_pdf():
    """Handle PDF upload"""
    try:
        if 'pdf_file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['pdf_file']
        input_language = request.form.get('input_language', 'English')
        
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Only PDF files are allowed'}), 400
        
        # Save uploaded file
        filename = secure_filename(f"{uuid.uuid4()}_{file.filename}")
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        
        # Extract text from PDF
        extracted_text = extract_text_from_pdf(file_path)
        if not extracted_text:
            return jsonify({'error': 'Failed to extract text from PDF'}), 400
        
        # Get available target languages
        target_languages = LANGUAGE_CONVERSION.get(input_language, ['English', 'Hindi', 'Malayalam'])
        
        return jsonify({
            'success': True,
            'extracted_text': extracted_text,
            'input_language': input_language,
            'target_languages': target_languages,
            'file_path': file_path
        })
    except Exception as e:
        print(f"Upload error: {e}")
        return jsonify({'error': 'Server error occurred'}), 500

@app.route('/api/translate-text', methods=['POST'])
def translate_text_endpoint():
    """Get translated text without audio generation"""
    try:
        data = request.json
        text = data.get('text', '')
        target_language = data.get('target_language', 'English')
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        # Translate text to target language
        translated_text = translate_text(text, target_language)
        
        return jsonify({
            'success': True,
            'translated_text': translated_text,
            'language': target_language
        })
    except Exception as e:
        print(f"Translation error: {e}")
        return jsonify({'error': 'Server error occurred'}), 500

@app.route('/api/get-pdf-pages', methods=['POST'])
def get_pdf_pages():
    """Get PDF pages for page-by-page display"""
    try:
        data = request.json
        file_path = data.get('file_path', '')
        
        if not file_path or not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 400
        
        # Extract pages
        pages, total_pages = extract_text_page_by_page(file_path)
        
        if pages is None:
            return jsonify({'error': 'Failed to extract pages'}), 500
        
        return jsonify({
            'success': True,
            'pages': pages,
            'total_pages': total_pages
        })
    except Exception as e:
        print(f"Page extraction error: {e}")
        return jsonify({'error': 'Server error occurred'}), 500

@app.route('/api/get-word-timings', methods=['POST'])
def get_word_timings():
    """Get word timing data for text highlighting during playback"""
    try:
        data = request.json
        text = data.get('text', '')
        audio_duration = data.get('duration', 0)
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        # Generate word timings
        word_timings = extract_words_with_timing(text, audio_duration)
        
        return jsonify({
            'success': True,
            'word_timings': word_timings,
            'total_words': len(text.split()),
            'duration': audio_duration
        })
    except Exception as e:
        print(f"Word timing error: {e}")
        return jsonify({'error': 'Server error occurred'}), 500

@app.route('/api/convert-text', methods=['POST'])
def convert_text():
    """Convert text to audio with word timing for highlighting"""
    try:
        data = request.json
        text = data.get('text', '')
        target_language = data.get('target_language', 'English')
        voice_gender = data.get('voice_gender', 'Female')
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        # Translate text to target language
        translated_text = translate_text(text, target_language)
        
        # Generate audio with word timing
        audio_data = generate_audio(translated_text, target_language, voice_gender)
        
        if not audio_data:
            return jsonify({'error': 'Failed to generate audio'}), 500
        
        return jsonify({
            'success': True,
            'translated_text': translated_text,
            'audio_filename': audio_data['filename'],
            'audio_url': f'/audio/{audio_data["filename"]}',
            'language': target_language,
            'voice': voice_gender,
            'duration': audio_data['duration'],
            'word_timings': audio_data['word_timings']
        })
    except Exception as e:
        print(f"Conversion error: {e}")
        return jsonify({'error': 'Server error occurred'}), 500

@app.route('/audio/<filename>')
def get_audio(filename):
    """Serve audio file"""
    try:
        file_path = os.path.join(app.config['AUDIO_OUTPUT_FOLDER'], filename)
        if os.path.exists(file_path):
            return send_file(file_path, mimetype='audio/mpeg')
        return jsonify({'error': 'Audio file not found'}), 404
    except Exception as e:
        print(f"Audio serve error: {e}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/download-audio/<filename>')
def download_audio(filename):
    """Download audio file"""
    try:
        file_path = os.path.join(app.config['AUDIO_OUTPUT_FOLDER'], filename)
        if os.path.exists(file_path):
            return send_file(
                file_path,
                mimetype='audio/mpeg',
                as_attachment=True,
                download_name=f'audio_{datetime.now().strftime("%Y%m%d_%H%M%S")}.mp3'
            )
        return jsonify({'error': 'Audio file not found'}), 404
    except Exception as e:
        print(f"Download error: {e}")
        return jsonify({'error': 'Server error'}), 500

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True)
